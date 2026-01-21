import duckdb from 'duckdb';
import path from 'path';

export class DuckDBAdapter {
    static dbCache = new Map(); // path -> { db, refCount, mode }
    static inProgressConnections = new Map(); // path -> Promise

    constructor(config) {
        this.config = config;
        this.db = null;
        this.connection = null;
        this.isInternal = config?.isInternal || false;

        // Normalize path to absolute to ensure cache hits work on Windows
        const rawPath = config?.path || ':memory:';
        this.dbPath = rawPath === ':memory:' ? rawPath : path.resolve(rawPath);

        console.log(`[DuckDB][PID:${process.pid}] Creating adapter. Path: ${this.dbPath}`);
    }

    async connect() {
        if (this.db) return;

        // If a connection for this path is already in progress, wait for it
        if (DuckDBAdapter.inProgressConnections.has(this.dbPath)) {
            console.log(`[DuckDB][PID:${process.pid}] Connection already in progress for ${this.dbPath}, waiting...`);
            await DuckDBAdapter.inProgressConnections.get(this.dbPath);
        }

        const useReadOnly = !!this.config?.readOnly;
        const entry = DuckDBAdapter.dbCache.get(this.dbPath);

        if (entry) {
            this.db = entry.db;
            entry.refCount++;
            console.log(`[DuckDB][PID:${process.pid}] Reusing cached database for ${this.dbPath}. RefCount: ${entry.refCount}, Mode: ${entry.mode}`);
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
                    DuckDBAdapter.dbCache.set(this.dbPath, {
                        db: this.db,
                        refCount: 1,
                        mode: useReadOnly ? 'READ_ONLY' : 'READ_WRITE'
                    });

                    this._finishConnect().then(resolve).catch(reject);
                });
            });
        })();

        DuckDBAdapter.inProgressConnections.set(this.dbPath, connectionPromise);

        try {
            await connectionPromise;
        } finally {
            DuckDBAdapter.inProgressConnections.delete(this.dbPath);
        }
    }

    async _finishConnect() {
        if (!this.db) throw new Error('Database instance not available');
        return new Promise((resolve, reject) => {
            try {
                this.connection = this.db.connect();
                console.log(`[DuckDB][PID:${process.pid}] Connected to database: ${this.dbPath}`);
                resolve();
            } catch (err) {
                console.error(`[DuckDB][PID:${process.pid}] Connection failed:`, err.message);
                reject(err);
            }
        });
    }

    async disconnect() {
        return new Promise((resolve) => {
            if (this.connection) {
                this.connection.close(() => {
                    const cached = DuckDBAdapter.dbCache.get(this.dbPath);
                    if (cached) {
                        cached.refCount--;
                        console.log(`[DuckDB] Decremented refCount for ${this.dbPath}. Current: ${cached.refCount}`);

                        // We keep the database instance open even if refCount is 0 to avoid constant re-opening locks
                        // but if you want to be strict, you can close it here.
                        // Given the "already open" issue, it's safer to keep the handle if we might need it again soon.
                        // However, let's close it if refCount is 0 to be a good citizen, 
                        // as long as we don't have overlapping requests (which refCount handles).
                        if (cached.refCount <= 0) {
                            cached.db.close(() => {
                                DuckDBAdapter.dbCache.delete(this.dbPath);
                                console.log(`[DuckDB] Closed and removed from cache: ${this.dbPath}`);
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
            const rows = await this.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'main'
            `);
            return rows.map(r => r.table_name);
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
