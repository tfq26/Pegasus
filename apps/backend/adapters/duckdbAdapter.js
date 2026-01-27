import duckdb from "duckdb"
import path from "node:path"
import ExcelJS from "exceljs";
import { resolveDatabasePath } from "../src/utils/resolveDatabasePath.js";

export class DuckDBAdapter {
    static dbCache = new Map(); // path -> { db, refCount, mode }
    static inProgressConnections = new Map(); // path -> Promise

    constructor(config, userId) {
        this.config = config;
        this.userId = userId; // Store userId for S3 access
        this.db = null;
        this.connection = null;
        this.isInternal = config?.isInternal || false;

        // Raw path from config (could be 'uploads/...' or absolute or ':memory:')
        this.rawPath = config?.path || ':memory:';

        // Detect if this is a spreadsheet/data file rather than a database file
        const ext = path.extname(this.rawPath).toLowerCase();
        this.isDataFile = ['.csv', '.xlsx', '.xls', '.parquet', '.json'].includes(ext);

        // Cache key is the raw path (e.g. 'uploads/...') ensuring uniqueness across requests
        this.cacheKey = this.rawPath;

        // Implementation flags
        this.isZeroCopy = false;

        // These will be resolved in connect()
        this.dbPath = null;
        this.dataFileSource = null;

        console.log(`[DuckDB][PID:${process.pid}] Initialized adapter for: ${this.rawPath}`);
    }

    async connect() {
        if (this.db) return;

        // Resolve absolute path (downloads from S3 if needed)
        // Optimization: Try to get a signed URL for Zero-Copy if applicable
        let resolvedPath;
        this.isZeroCopy = false; // Reset flag

        if (this.isDataFile) {
            try {
                // Try to get a public URL first
                resolvedPath = await resolveDatabasePath(this.rawPath, this.userId, { preferSignedUrl: true });
                if (resolvedPath.startsWith('http')) {
                    this.isZeroCopy = true;
                    console.log(`[DuckDB] Using Zero-Copy URL for ${this.rawPath}`);
                }
            } catch (e) {
                console.warn("[DuckDB] Zero-Copy resolution failed, falling back to local download:", e.message);
            }
        }

        if (!resolvedPath) {
            resolvedPath = await resolveDatabasePath(this.rawPath, this.userId);
        }

        this.dbPath = (this.isDataFile || resolvedPath === ':memory:') ? ':memory:' : resolvedPath;
        this.dataFileSource = this.isDataFile ? resolvedPath : null;

        // Connection already in progress?
        if (DuckDBAdapter.inProgressConnections.has(this.cacheKey)) {
            console.log(`[DuckDB][PID:${process.pid}] Connection already in progress for ${this.cacheKey}, waiting...`);
            await DuckDBAdapter.inProgressConnections.get(this.cacheKey);
        }

        // Data files MUST be read-write in memory so we can create views
        const useReadOnly = this.isDataFile ? false : !!this.config?.readOnly;
        const entry = DuckDBAdapter.dbCache.get(this.cacheKey);

        if (entry) {
            this.db = entry.db;
            entry.refCount++;
            console.log(`[DuckDB][PID:${process.pid}] Reusing cached database for ${this.cacheKey}. RefCount: ${entry.refCount}, Mode: ${entry.mode}`);
            return this._finishConnect();
        }

        // Create a new connection promise
        const connectionPromise = (async () => {
            const mode = useReadOnly ? duckdb.OPEN_READONLY : duckdb.OPEN_READWRITE;
            console.log(`[DuckDB][PID:${process.pid}] Opening physical database for ${this.dbPath} (Mode: ${useReadOnly ? 'READ_ONLY' : 'READ_WRITE'})`);

            return new Promise((resolve, reject) => {
                this.db = new duckdb.Database(this.dbPath, mode, (err) => {
                    if (err) {
                        console.error(`[DuckDB][PID:${process.pid}] Failed to open database ${this.dbPath}:`, err.message);
                        reject(err);
                        return;
                    }

                    // Success!
                    DuckDBAdapter.dbCache.set(this.cacheKey, {
                        db: this.db,
                        refCount: 1,
                        mode: useReadOnly ? 'READ_ONLY' : 'READ_WRITE'
                    });

                    this._finishConnect().then(resolve).catch(reject);
                });
            });
        })();

        DuckDBAdapter.inProgressConnections.set(this.cacheKey, connectionPromise);

        try {
            await connectionPromise;
        } finally {
            DuckDBAdapter.inProgressConnections.delete(this.cacheKey);
        }
    }

    async _finishConnect() {
        if (!this.db) throw new Error('Database instance not available');

        return new Promise(async (resolve, reject) => {
            try {
                this.connection = this.db.connect();
                console.log(`[DuckDB][PID:${process.pid}] Connected to database: ${this.dbPath}`);

                // Load extensions for Zero-Copy (S3/HTTP/Spatial)
                try {
                    await new Promise((resolve, reject) => {
                        this.connection.exec(`INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;`, (err) => {
                            if (err) console.warn("[DuckDB] Failed to load extensions:", err.message);
                            else resolve();
                        });
                    });
                } catch (e) { /* ignore */ }

                // If we are hosting a specific data file, register it as a table/view now
                if (this.dataFileSource) {
                    const ext = path.extname(this.rawPath).toLowerCase(); // Use rawPath ext, as URL might not have it
                    // Sanitize table name from raw filename
                    const baseName = path.basename(this.rawPath, ext);
                    const tableName = baseName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                    let query = "";

                    console.log(`[DuckDB] Attempting to register data file: ${this.dataFileSource} as table: ${tableName} (ZeroCopy: ${this.isZeroCopy})`);

                    if (ext === '.csv') {
                        query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_csv_auto('${this.dataFileSource}')`;
                    } else if (ext === '.parquet') {
                        query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${this.dataFileSource}')`;
                    } else if (ext === '.json') {
                        query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_json_auto('${this.dataFileSource}')`;
                    } else if (ext === '.xlsx' || ext === '.xls') {
                        // Excel Handling:
                        // 1. Try Zero-Copy via st_read (spatial extension) if URL
                        // 2. Fallback to ExcelJS conversion if local file OR if st_read fails

                        let excelSuccess = false;

                        if (this.isZeroCopy) {
                            try {
                                const zeroCopyQuery = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM st_read('${this.dataFileSource}')`;
                                console.log(`[DuckDB] Attempting Zero-Copy Excel load: ${zeroCopyQuery}`);
                                await new Promise((resolve, reject) => {
                                    this.connection.exec(zeroCopyQuery, (err) => err ? reject(err) : resolve());
                                });
                                console.log(`[DuckDB] Zero-Copy Excel load successful.`);
                                excelSuccess = true;
                                return resolve(); // Exit early if successful
                            } catch (e) {
                                console.warn(`[DuckDB] Zero-Copy Excel load failed, falling back to local download/conversion. Error: ${e.message}`);
                                // Fallback: Download file locally needed
                                const localPath = await resolveDatabasePath(this.rawPath, this.userId, { preferSignedUrl: false });
                                this.dataFileSource = localPath; // Update source to local path
                                this.isZeroCopy = false;
                            }
                        }

                        if (!excelSuccess) {
                            // Manual CSV conversion for Excel files (Existing Logic)
                            // ExcelJS's built-in CSV writer doesn't handle complex sheets well
                            try {
                                const workbook = new ExcelJS.Workbook();
                                await workbook.xlsx.readFile(this.dataFileSource);
                                const worksheet = workbook.worksheets[0];

                                // Smart Header Detection: Find the best header row
                                // Key insight: Title rows from merged cells have DUPLICATES (low uniqueness)
                                // Real header rows have UNIQUE column names (high uniqueness)
                                let headerRowIndex = 1;
                                let bestScore = 0;
                                const rowLimit = Math.min(30, worksheet.rowCount);
                                const MIN_FILLED_THRESHOLD = 5;

                                for (let i = 1; i <= rowLimit; i++) {
                                    const row = worksheet.getRow(i);
                                    const values = [];
                                    let numericCount = 0;
                                    let textCount = 0;

                                    row.eachCell({ includeEmpty: false }, (cell) => {
                                        if (cell.value) {
                                            const val = String(cell.value).trim();
                                            values.push(val);
                                            if (!isNaN(Number(val)) && val !== '') {
                                                numericCount++;
                                            } else {
                                                textCount++;
                                            }
                                        }
                                    });

                                    const filledCount = values.length;
                                    const uniqueCount = new Set(values).size;
                                    const uniquenessRatio = filledCount > 0 ? uniqueCount / filledCount : 0;

                                    // Good header row criteria:
                                    // 1. At least MIN_FILLED_THRESHOLD cells
                                    // 2. Mostly text (not data rows which are mostly numeric)
                                    // 3. High uniqueness ratio (>0.8) - real headers are unique, merged titles are duplicates
                                    // Score = uniqueness * fill count (balance between coverage and uniqueness)
                                    const score = uniquenessRatio >= 0.8 && textCount > numericCount
                                        ? uniquenessRatio * filledCount
                                        : 0;

                                    if (filledCount >= MIN_FILLED_THRESHOLD && score > bestScore) {
                                        bestScore = score;
                                        headerRowIndex = i;
                                        console.log(`[DuckDB] Candidate header row: ${i} (filled=${filledCount}, unique=${uniqueCount}, ratio=${uniquenessRatio.toFixed(2)}, score=${score.toFixed(1)})`);
                                    }
                                }

                                console.log(`[DuckDB] Selected header row: ${headerRowIndex} (score=${bestScore.toFixed(1)})`);

                                // Fallback: if no row passed the uniqueness threshold, use first non-empty row
                                if (bestScore === 0) {
                                    console.log(`[DuckDB] No high-uniqueness row found, falling back to row 1 or first non-empty`);
                                    for (let i = 1; i <= Math.min(10, worksheet.rowCount); i++) {
                                        const row = worksheet.getRow(i);
                                        let hasContent = false;
                                        row.eachCell({ includeEmpty: false }, (cell) => {
                                            if (cell.value) hasContent = true;
                                        });
                                        if (hasContent) {
                                            headerRowIndex = i;
                                            console.log(`[DuckDB] Fallback: using row ${i} as header`);
                                            break;
                                        }
                                    }
                                }

                                // Extract headers from detected row
                                const headerRow = worksheet.getRow(headerRowIndex);
                                const headers = [];
                                let maxCol = 0;
                                headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                                    headers[colNumber - 1] = cell.value ? String(cell.value).trim() : `Column${colNumber}`;
                                    maxCol = Math.max(maxCol, colNumber);
                                });

                                // Build CSV manually with proper escaping
                                const escapeCSV = (val) => {
                                    if (val === null || val === undefined) return '';
                                    const str = String(val);
                                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                        return `"${str.replace(/"/g, '""')}"`;
                                    }
                                    return str;
                                };

                                const csvLines = [];

                                // Header line
                                csvLines.push(headers.slice(0, maxCol).map(escapeCSV).join(','));

                                // Data lines (starting from row after header)
                                for (let i = headerRowIndex + 1; i <= worksheet.rowCount; i++) {
                                    const row = worksheet.getRow(i);
                                    const rowData = [];
                                    for (let c = 1; c <= maxCol; c++) {
                                        const cell = row.getCell(c);
                                        rowData.push(escapeCSV(cell.value));
                                    }
                                    // Skip completely empty rows
                                    if (rowData.some(v => v !== '')) {
                                        csvLines.push(rowData.join(','));
                                    }
                                }

                                // Write to temp CSV
                                const tempCsvPath = this.dataFileSource + '.temp.csv';
                                const fs = await import('fs/promises');
                                await fs.writeFile(tempCsvPath, csvLines.join('\n'), 'utf-8');

                                query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_csv_auto('${tempCsvPath}')`;
                                console.log(`[DuckDB] Manually converted Excel to CSV. Headers from row ${headerRowIndex}, ${csvLines.length - 1} data rows.`);
                            } catch (conversionErr) {
                                console.error(`[DuckDB] Excel conversion failed: ${conversionErr.message}`);
                                // Last ditch attempt with st_read on local file
                                query = `INSTALL spatial; LOAD spatial; CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM st_read('${this.dataFileSource}')`;
                            }
                        }
                    }

                    if (query) {
                        console.log(`[DuckDB] Executing view creation query: ${query.substring(0, 100)}...`);
                        this.connection.exec(query, (err) => {
                            if (err) {
                                console.error(`[DuckDB] Failed to register data file table: ${err.message}`);
                                console.error(`[DuckDB] Query was: ${query}`);
                                reject(err);
                            } else {
                                console.log(`[DuckDB] Successfully registered data file as table: ${tableName}`);
                                resolve();
                            }
                        });
                        return;
                    }
                }

                resolve();
            } catch (err) {
                console.error(`[DuckDB][PID:${process.pid}] Connection failed:`, err.message);
                reject(err);
            }
        });
    }

    /**
     * Registers an additional data file as a table in the current connection.
     * Useful for multi-file analysis in a single context.
     */
    async registerTable(tableName, filePath) {
        if (!this.connection) await this.connect();

        const ext = path.extname(filePath).toLowerCase();
        let query = "";

        if (ext === '.csv') {
            query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_csv_auto('${filePath}')`;
        } else if (ext === '.parquet') {
            query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_parquet('${filePath}')`;
        } else if (ext === '.json') {
            query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM read_json_auto('${filePath}')`;
        } else if (ext === '.xlsx' || ext === '.xls') {
            // Simple st_read for zero-copy/local Excel in ad-hoc registrations
            // We assume extensions are already loaded from connect()
            query = `CREATE OR REPLACE VIEW "${tableName}" AS SELECT * FROM st_read('${filePath}')`;
        }

        if (query) {
            return new Promise((resolve, reject) => {
                this.connection.exec(query, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
    }

    async disconnect() {
        return new Promise((resolve) => {
            if (this.connection) {
                this.connection.close(() => {
                    const cached = DuckDBAdapter.dbCache.get(this.cacheKey);
                    if (cached) {
                        cached.refCount--;
                        console.log(`[DuckDB] Decremented refCount for ${this.cacheKey}. Current: ${cached.refCount}`);

                        // We keep the database instance open even if refCount is 0 to avoid constant re-opening locks
                        // but if you want to be strict, you can close it here.
                        // Given the "already open" issue, it's safer to keep the handle if we might need it again soon.
                        // However, let's close it if refCount is 0 to be a good citizen, 
                        // as long as we don't have overlapping requests (which refCount handles).
                        if (cached.refCount <= 0) {
                            cached.db.close(() => {
                                DuckDBAdapter.dbCache.delete(this.cacheKey);
                                console.log(`[DuckDB] Closed and removed from cache: ${this.cacheKey}`);
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    } else {
                        // Should not happen if everything is balanced
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                return reject(new Error('DuckDB connection not established'));
            }

            console.log(`[DuckDB] Executing query: ${sql.substring(0, 100)}...`);

            this.connection.all(sql, ...params, (err, rows) => {
                if (err) {
                    console.error('[DuckDB] Query error:', err);
                    return reject(err);
                }
                resolve(rows || []);
            });
        });
    }

    async execute(sql) {
        return new Promise((resolve, reject) => {
            if (!this.connection) {
                return reject(new Error('DuckDB connection not established'));
            }

            this.connection.exec(sql, (err, result) => {
                if (err) {
                    console.error('[DuckDB] Execute error:', err);
                    return reject(err);
                }
                resolve(result);
            });
        });
    }

    async listCollections() {
        try {
            // information_schema might miss some dynamically created views depending on how they are registered
            // show_tables is universally supported in DuckDB
            const rows = await this.query(`SHOW TABLES`);
            console.log('[DuckDB] SHOW TABLES result:', JSON.stringify(rows));

            return rows.map(r => {
                // DuckDB might return 'name', 'table_name', or just the first value
                return r.name || r.table_name || r.NAME || r.TABLE_NAME || Object.values(r)[0];
            });
        } catch (e) {
            console.error('[DuckDB] Error listing tables:', e);
            return [];
        }
    }

    async getOneTableSchema(tableName) {
        try {
            const columns = await this.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = ?
                ORDER BY ordinal_position
            `, [tableName]);

            return columns.map(col => ({
                name: col.column_name,
                type: col.data_type,
                nullable: col.is_nullable === 'YES'
            }));
        } catch (e) {
            console.error(`[DuckDB] Error getting schema for ${tableName}:`, e);
            return [];
        }
    }

    async getSchema() {
        try {
            const tables = await this.listCollections();
            const schema = {};

            for (const table of tables) {
                schema[table] = await this.getOneTableSchema(table);
            }

            return schema;
        } catch (e) {
            console.error('[DuckDB] Error getting full schema:', e);
            return {};
        }
    }

    async sampleCollection(tableName, limit = 5) {
        try {
            return await this.query(`SELECT * FROM "${tableName}" LIMIT ${limit}`);
        } catch (e) {
            console.error(`[DuckDB] Error sampling ${tableName}:`, e);
            return [];
        }
    }

    // DuckDB-specific optimized methods
    async createTableFromCSV(tableName, csvPath) {
        try {
            await this.execute(`
                CREATE TABLE "${tableName}" AS 
                SELECT * FROM read_csv_auto('${csvPath}')
            `);
            console.log(`[DuckDB] Created table ${tableName} from CSV`);
            return true;
        } catch (e) {
            console.error(`[DuckDB] Error creating table from CSV:`, e);
            throw e;
        }
    }

    async createTableFromParquet(tableName, parquetPath) {
        try {
            await this.execute(`
                CREATE TABLE "${tableName}" AS 
                SELECT * FROM read_parquet('${parquetPath}')
            `);
            console.log(`[DuckDB] Created table ${tableName} from Parquet`);
            return true;
        } catch (e) {
            console.error(`[DuckDB] Error creating table from Parquet:`, e);
            throw e;
        }
    }

    async exportToParquet(tableName, outputPath) {
        try {
            await this.execute(`
                COPY (SELECT * FROM "${tableName}") 
                TO '${outputPath}' (FORMAT PARQUET)
            `);
            console.log(`[DuckDB] Exported ${tableName} to Parquet at ${outputPath}`);
            return true;
        } catch (e) {
            console.error(`[DuckDB] Error exporting to Parquet:`, e);
            throw e;
        }
    }

    // Optimized aggregation method
    async aggregate(tableName, aggregations) {
        try {
            const aggParts = Object.entries(aggregations).map(([name, expr]) => {
                return `${expr} AS ${name}`;
            });

            const sql = `SELECT ${aggParts.join(', ')} FROM "${tableName}"`;
            const result = await this.query(sql);
            return result[0] || {};
        } catch (e) {
            console.error(`[DuckDB] Error in aggregation:`, e);
            throw e;
        }
    }
}
