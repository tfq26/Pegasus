import duckdb from 'duckdb';

export class DuckDBAdapter {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.connection = null;
        this.isInternal = config?.isInternal || false;
        this.dbPath = config?.path || ':memory:';

        console.log(`[DuckDB] Creating adapter. Path: ${this.dbPath}, isInternal: ${this.isInternal}`);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                // Create database instance with READ_ONLY mode to allow concurrent access
                this.db = new duckdb.Database(this.dbPath, {
                    access_mode: 'READ_WRITE' // Default to READ_WRITE to allow creation
                }, (err) => {
                    if (err) {
                        // If it fails, try without options (default)
                        this.db = new duckdb.Database(this.dbPath, (err2) => {
                            if (err2) {
                                console.error('[DuckDB] Database creation error:', err2);
                                return reject(err2);
                            }
                            // Create connection
                            this.connection = this.db.connect();
                            console.log(`[DuckDB] Connected to database: ${this.dbPath}`);
                            resolve();
                        });
                    } else {
                        // Create connection
                        this.connection = this.db.connect();
                        console.log(`[DuckDB] Connected to database: ${this.dbPath}`);
                        resolve();
                    }
                });
            } catch (e) {
                console.error('[DuckDB] Connection error:', e);
                reject(e);
            }
        });
    }

    async disconnect() {
        return new Promise((resolve) => {
            if (this.connection) {
                this.connection.close(() => {
                    if (this.db) {
                        this.db.close(() => {
                            console.log('[DuckDB] Disconnected');
                            resolve();
                        });
                    } else {
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
