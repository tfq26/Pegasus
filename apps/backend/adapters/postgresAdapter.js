import { DatabaseAdapter } from "./DatabaseAdapter.js"
import pg from 'pg'
const { Client } = pg

export class PostgresAdapter extends DatabaseAdapter {
    constructor(config) {
        super(config)
        this.client = null
    }

    async connect() {
        if (this.client) return

        // Handle both connection string and object config
        const connectionConfig = this.connection.connectionString
            ? { connectionString: this.connection.connectionString }
            : {
                host: this.connection.host,
                port: parseInt(this.connection.port || '5432'),
                user: this.connection.user,
                password: this.connection.password,
                database: this.connection.database,
                ssl: this.connection.ssl ? { rejectUnauthorized: false } : undefined
            }

        this.client = new Client(connectionConfig)
        await this.client.connect()
    }

    async disconnect() {
        if (this.client) {
            await this.client.end()
            this.client = null
        }
    }

    async listCollections() {
        if (!this.client) await this.connect()

        // Fetch all tables in the public schema
        const res = await this.client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

        return res.rows.map(row => row.table_name)
    }

    async *queryStream(queryString) {
        if (!this.client) await this.connect()
        const res = await this.client.query(queryString)

        // Postgres returns metadata in 'command', 'rowCount', etc.
        // If it's a SELECT, we stream rows.
        const command = res.command ? res.command.toUpperCase() : ''
        if (command === 'SELECT' || command === 'SHOW' || (res.rows && res.rows.length > 0)) {
            for (const row of res.rows) {
                yield row
            }
        } else {
            // For mutations/DDL, yield a synthetic result
            yield {
                affectedRows: res.rowCount,
                command: res.command,
                message: `${res.command} successful. ${res.rowCount !== null ? res.rowCount + ' rows affected' : ''}`.trim()
            }
        }
    }

    async sampleCollection(collectionName, limit = 5) {
        return this.query(`SELECT * FROM "${collectionName}" LIMIT ${limit}`)
    }

    /**
     * Apply a batch of atomic operations (Spreadsheet delta updates)
     */
    async applyOperations(tableName, operations) {
        if (!this.client) await this.connect()

        try {
            await this.client.query('BEGIN');

            for (const op of operations) {
                switch (op.type) {
                    case 'full_replacement': {
                        await this.client.query(`DELETE FROM "${tableName}"`);
                        if (op.rows && op.rows.length > 0) {
                            for (const row of op.rows) {
                                const keys = Object.keys(row).filter(k => k !== '__id' && k !== '_id');
                                const cols = keys.map(k => `"${k}"`).join(', ');
                                const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
                                const values = keys.map(k => row[k]);
                                await this.client.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`, values);
                            }
                        }
                        break;
                    }

                    case 'create': {
                        const data = op.data || {};
                        const keys = Object.keys(data).filter(k => k !== '__id' && k !== '_id');
                        if (keys.length > 0) {
                            const cols = keys.map(k => `"${k}"`).join(', ');
                            const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
                            const values = keys.map(k => data[k]);
                            await this.client.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`, values);
                        }
                        break;
                    }

                    case 'update': {
                        const changes = op.changes || {};
                        const keys = Object.keys(changes).filter(k => k !== '__id' && k !== '_id');
                        const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
                        const values = [op.id, ...keys.map(k => changes[k])];

                        if (setClause && op.id) {
                            // Postgres doesn't have a universal rowid, assume 'id' or provided '__id'
                            await this.client.query(`UPDATE "${tableName}" SET ${setClause} WHERE id = $1`, values);
                        }
                        break;
                    }

                    case 'delete': {
                        if (op.id) {
                            await this.client.query(`DELETE FROM "${tableName}" WHERE id = $1`, [op.id]);
                        }
                        break;
                    }

                    case 'add_column': {
                        if (op.column) {
                            await this.client.query(`ALTER TABLE "${tableName}" ADD COLUMN "${op.column}" TEXT`);
                        }
                        break;
                    }

                    case 'drop_column': {
                        if (op.column) {
                            await this.client.query(`ALTER TABLE "${tableName}" DROP COLUMN "${op.column}"`);
                        }
                        break;
                    }
                }
            }

            await this.client.query('COMMIT');
        } catch (e) {
            await this.client.query('ROLLBACK');
            throw e;
        }
    }

    async getSchema() {
        if (!this.client) await this.connect()

        try {
            // Get all tables
            const tablesRes = await this.client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `)

            const schema = {}

            for (const row of tablesRes.rows) {
                const tableName = row.table_name

                // Get columns for each table
                const columnsRes = await this.client.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = $1
          ORDER BY ordinal_position
        `, [tableName])

                schema[tableName] = columnsRes.rows.map(col => ({
                    name: col.column_name,
                    type: col.data_type,
                    nullable: col.is_nullable === 'YES'
                }))
            }

            return schema
        } catch (e) {
            console.error('[Postgres] Error fetching schema:', e)
            return {}
        }
    }

    async getEstimatedCount(tableName) {
        if (!this.client) await this.connect();
        try {
            const res = await this.client.query(`
                SELECT reltuples::bigint AS estimate 
                FROM pg_class 
                WHERE oid = $1::regclass
            `, [tableName]);
            return parseInt(res.rows[0]?.estimate) || 0;
        } catch (e) {
            console.warn(`[Postgres] Failed to get estimated count for ${tableName}:`, e.message);
            return null;
        }
    }

    async explain(query) {
        if (!this.client) await this.connect();
        console.log(`[Postgres] Explaining query: ${query.substring(0, 50)}...`);
        try {
            // Use EXPLAIN ANALYZE for actual performance data
            const res = await this.client.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`);
            return res.rows[0]['QUERY PLAN'];
        } catch (error) {
            console.error(`[Postgres] Explain failed:`, error);
            throw new Error(`Postgres explain error: ${error.message}`);
        }
    }

    async getProfile(tableName) {
        if (!this.client) await this.connect();
        try {
            // Get column info first
            const columnsRes = await this.client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = $1
                ORDER BY ordinal_position
            `, [tableName]);

            if (columnsRes.rows.length === 0) return { tableName, columns: [] };

            const columnNames = columnsRes.rows.map(c => c.column_name);

            // Build a massive aggregate query for efficiency
            let selectParts = ['COUNT(*) as total_count'];
            columnNames.forEach(col => {
                const escaped = `"${col}"`;
                selectParts.push(`COUNT(${escaped}) as "${col}_non_null"`);
                selectParts.push(`COUNT(DISTINCT ${escaped}) as "${col}_distinct"`);
                // Add min/max for non-binary types
                selectParts.push(`MIN(${escaped})::text as "${col}_min"`);
                selectParts.push(`MAX(${escaped})::text as "${col}_max"`);
            });

            const statsRes = await this.client.query(`SELECT ${selectParts.join(', ')} FROM "${tableName}"`);
            const stats = statsRes.rows[0];
            const totalCount = parseInt(stats.total_count);

            const profile = {
                tableName,
                rowCount: totalCount,
                columns: columnsRes.rows.map(col => {
                    const name = col.column_name;
                    return {
                        name,
                        type: col.data_type,
                        nullCount: totalCount - parseInt(stats[`${name}_non_null`]),
                        distinctCount: parseInt(stats[`${name}_distinct`]),
                        min: stats[`${name}_min`],
                        max: stats[`${name}_max`]
                    };
                })
            };

            return profile;
        } catch (e) {
            console.error(`[Postgres] Profile failed for ${tableName}:`, e.message);
            throw e;
        }
    }
}
