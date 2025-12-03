import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { createClient } from "@libsql/client"

export class SQLiteAdapter extends DatabaseAdapter {
  async connect() {
    // Connection can be a file path, ':memory:', or a remote URL (Turso)
    const dbPath = this.connection.database || this.connection.path || ':memory:'
    const authToken = this.connection.authToken || this.connection.password // Support both fields

    let url = dbPath
    if (dbPath !== ':memory:' && !dbPath.startsWith('http') && !dbPath.startsWith('libsql')) {
      url = `file:${dbPath}`
    }

    console.log(`[SQLite] Connecting to database at: ${url}`)
    console.log(`[SQLite] Auth Token present: ${!!authToken}`)

    try {
      // If remote URL, use custom fetch client to avoid Vercel issues
      if (url.startsWith('http') || url.startsWith('libsql')) {
        console.log("[SQLite] Using CustomFetchClient for remote connection")
        this.db = new CustomFetchClient(url, authToken)
      } else {
        this.db = createClient({ url })
      }
      console.log(`[SQLite] Successfully opened database connection`)
    } catch (e) {
      console.error(`[SQLite] Failed to open database at ${url}:`, e)
      throw e
    }
  }
}

// Minimal Fetch Client for Turso (Same as in db/index.js)
class CustomFetchClient {
  constructor(url, authToken) {
    this.url = url
    this.authToken = authToken
  }

  async execute(stmt) {
    let sql, args
    if (typeof stmt === 'string') {
      sql = stmt
      args = []
    } else {
      sql = stmt.sql
      args = stmt.args || []
    }

    // Convert named args to positional (basic regex)
    if (args && !Array.isArray(args) && typeof args === 'object') {
      const namedValues = args
      const positionalArgs = []
      sql = sql.replace(/([:@$][a-zA-Z0-9_]+)/g, (match, paramName) => {
        let val = namedValues[paramName]
        if (val === undefined) val = namedValues[paramName.substring(1)]
        if (val === undefined) return match
        positionalArgs.push(val)
        return "?"
      })
      args = positionalArgs
    }

    const httpUrl = this.url.replace("libsql://", "https://") + "/v2/pipeline"

    const response = await fetch(httpUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: this.formatArgs(args) } },
          { type: "close" }
        ]
      })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Turso Error ${response.status}: ${text}`)
    }

    const data = await response.json()
    const result = data.results[0]

    if (result.type === 'error') throw new Error(result.error.message)

    return {
      rows: this.parseRows(result.response.result),
      rowsAffected: result.response.result.affected_row_count,
      lastInsertRowid: result.response.result.last_insert_rowid
    }
  }

  formatArgs(args) {
    return args.map(val => {
      if (val === null) return { type: "null" }
      if (typeof val === 'number') return { type: "float", value: val }
      if (typeof val === 'boolean') return { type: "integer", value: val ? "1" : "0" }
      return { type: "text", value: String(val) }
    })
  }

  parseRows(result) {
    if (!result.cols || !result.rows) return []
    const cols = result.cols.map(c => c.name)
    return result.rows.map(row => {
      const obj = {}
      row.forEach((cell, i) => {
        let val = cell.value
        if (cell.type === 'integer' || cell.type === 'float') val = Number(val)
        obj[cols[i]] = val
      })
      return obj
    })
  }

  close() { }

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
