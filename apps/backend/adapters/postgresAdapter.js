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

    async sampleCollection(collectionName, limit = 5) {
        if (!this.client) await this.connect()

        // Use quote_ident to safely escape table names
        const res = await this.client.query(`SELECT * FROM "${collectionName}" LIMIT $1`, [limit])
        return res.rows
    }

    async query(query) {
        if (!this.client) await this.connect()

        const res = await this.client.query(query)

        // Postgres returns 'command' (e.g. 'SELECT', 'INSERT') and 'rowCount'
        const command = res.command ? res.command.toUpperCase() : ''

        if (command === 'SELECT' || command === 'SHOW' || (res.rows && res.rows.length > 0)) {
            return res.rows
        } else {
            // For mutations/DDL
            return {
                affectedRows: res.rowCount,
                command: res.command,
                message: `${res.command} successful. ${res.rowCount !== null ? res.rowCount + ' rows affected' : ''}`.trim()
            }
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
}
