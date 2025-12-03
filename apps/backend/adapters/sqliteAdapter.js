import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { createClient } from "@libsql/client"

export class SQLiteAdapter extends DatabaseAdapter {
  async connect() {
    // Connection can be a file path or ':memory:' for in-memory database
    const dbPath = this.connection.database || this.connection.path || ':memory:'
    const url = dbPath === ':memory:' ? ':memory:' : `file:${dbPath}`

    console.log(`[SQLite] Connecting to database at: ${url}`)

    try {
      this.db = createClient({ url })
      console.log(`[SQLite] Successfully opened database connection`)
    } catch (e) {
      console.error(`[SQLite] Failed to open database at ${url}:`, e)
      throw e
    }
  }

  async query(query) {
    console.log(`[SQLite] Executing query: ${query}`)
    try {
      const result = await this.db.execute(query)

      // Determine if this is a SELECT query or a mutation
      const trimmedQuery = query.trim().toUpperCase()
      const isSelect = trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('PRAGMA')

      if (isSelect) {
        return result.rows
      } else {
        return {
          affectedRows: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid,
          message: `${result.rowsAffected} rows affected`
        }
      }
    } catch (error) {
      console.error(`[SQLite] Query failed: ${query}`, error)
      throw new Error(`SQLite query error: ${error.message}`)
    }
  }

  async listCollections() {
    try {
      const result = await this.db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      const tables = result.rows

      console.log('[SQLite] Raw tables found:', tables)

      const tableNames = tables.map(t => t.name)
      console.log('[SQLite] Formatted table names:', tableNames)

      return tableNames
    } catch (e) {
      console.error('[SQLite] Error listing tables:', e)
      return []
    }
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []
    const safeLimit = Math.max(1, Number(limit) || 5)

    try {
      const result = await this.db.execute(`SELECT * FROM "${name}" LIMIT ${safeLimit}`)
      return result.rows
    } catch (error) {
      console.warn(`Failed to sample table ${name}:`, error.message)
      return []
    }
  }

  async getSchema() {
    try {
      const result = await this.db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      const tables = result.rows

      const schema = {}

      for (const t of tables) {
        const tableName = t.name
        const colResult = await this.db.execute(`PRAGMA table_info("${tableName}")`)
        const columns = colResult.rows

        schema[tableName] = columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.notnull === 0,
          pk: col.pk > 0
        }))
      }

      return schema
    } catch (e) {
      console.error('[SQLite] Error fetching schema:', e)
      return {}
    }
  }

  async disconnect() {
    if (this.db) {
      this.db.close()
    }
  }
}
