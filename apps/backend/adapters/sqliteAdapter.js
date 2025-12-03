import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { Database } from "bun:sqlite"

export class SQLiteAdapter extends DatabaseAdapter {
  async connect() {
    // Connection can be a file path or ':memory:' for in-memory database
    const dbPath = this.connection.database || this.connection.path || ':memory:'
    console.log(`[SQLite] Connecting to database at: ${dbPath}`)

    try {
      this.db = new Database(dbPath)
      console.log(`[SQLite] Successfully opened database connection`)
    } catch (e) {
      console.error(`[SQLite] Failed to open database at ${dbPath}:`, e)
      throw e
    }
  }

  async query(query) {
    console.log(`[SQLite] Executing query: ${query}`)
    try {
      // Determine if this is a SELECT query or a mutation
      const trimmedQuery = query.trim().toUpperCase()
      const isSelect = trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('PRAGMA')
      const isMutation = trimmedQuery.startsWith('INSERT') || trimmedQuery.startsWith('UPDATE') || trimmedQuery.startsWith('DELETE')
      const isDDL = trimmedQuery.startsWith('CREATE') || trimmedQuery.startsWith('DROP') || trimmedQuery.startsWith('ALTER')

      if (isSelect) {
        return this.db.query(query).all()
      } else if (isMutation || isDDL) {
        const result = this.db.run(query)
        // Return a meaningful result for mutations/DDL
        return {
          affectedRows: result.changes,
          lastInsertRowid: result.lastInsertRowid,
          message: isDDL ? 'Schema updated successfully' : `${result.changes} rows affected`
        }
      } else {
        // Fallback for other queries
        return this.db.run(query)
      }
    } catch (error) {
      console.error(`[SQLite] Query failed: ${query}`, error)
      throw new Error(`SQLite query error: ${error.message}`)
    }
  }

  async listCollections() {
    try {
      const tables = this.db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all()

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
      return this.db.query(`SELECT * FROM "${name}" LIMIT ${safeLimit}`).all()
    } catch (error) {
      console.warn(`Failed to sample table ${name}:`, error.message)
      return []
    }
  }

  async getSchema() {
    try {
      const tables = this.db.query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all()

      const schema = {}

      for (const t of tables) {
        const tableName = t.name
        const columns = this.db.query(`PRAGMA table_info("${tableName}")`).all()

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
