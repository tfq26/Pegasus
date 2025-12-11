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

      let tableNames = tables.map(t => t.name)

      // Filter tables by uploadId if present (Robust Dynamic Linking)
      if (this.connection.uploadId) {
        // Pattern: data_<uploadId>_<anything>
        // Note: Upload IDs in table names use underscores, but internally they might be hyphens.
        // We handle both just in case, or assume the table name format.
        // Table name format: data_<uuid_with_underscores>_Name

        // Convert hyphenated ID to underscores for matching
        const idPattern = this.connection.uploadId.replace(/-/g, '_')
        console.log(`[SQLite] Filtering by uploadId: ${this.connection.uploadId} (pattern: ${idPattern})`)

        tableNames = tableNames.filter(t => t.startsWith(`data_${idPattern}_`))
      }
      // Fallback: Filter tables if allowedTables is set (Legacy Static Linking)
      else if (this.connection.tables && Array.isArray(this.connection.tables) && this.connection.tables.length > 0) {
        console.log('[SQLite] Filtering tables:', this.connection.tables)
        tableNames = tableNames.filter(t => this.connection.tables.includes(t))
      }

      console.log('[SQLite] Formatted table names:', tableNames)

      return tableNames
    } catch (e) {
      console.error('[SQLite] Error listing tables:', e)
      return []
    }
  }

  async sampleCollection(name, limit = 5) {
    if (!name) return []

    // Security check: ensure table is allowed
    if (this.connection.tables && Array.isArray(this.connection.tables) && this.connection.tables.length > 0) {
      if (!this.connection.tables.includes(name)) {
        console.warn(`[SQLite] Access denied to table ${name}`)
        return []
      }
    }

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

        // Filter tables if allowedTables is set
        if (this.connection.tables && Array.isArray(this.connection.tables) && this.connection.tables.length > 0) {
          if (!this.connection.tables.includes(tableName)) continue
        }

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

  async batch(queries) {
    console.log(`[SQLite] Executing batch of ${queries.length} queries`)
    try {
      if (this.db.executeBatch) {
        // CustomFetchClient
        return await this.db.executeBatch(queries)
      } else {
        // Local libSQL client supports batch
        return await this.db.batch(queries, 'write')
      }
    } catch (e) {
      console.error('[SQLite] Batch failed:', e)
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

  async executeBatch(sqls) {
    const requests = sqls.map(stmt => {
      let sql, args
      if (typeof stmt === 'string') {
        sql = stmt
        args = []
      } else {
        sql = stmt.sql
        args = stmt.args || []
      }
      return { type: "execute", stmt: { sql, args: this.formatArgs(args) } }
    })
    requests.push({ type: "close" })

    const httpUrl = this.url.replace("libsql://", "https://") + "/v2/pipeline"

    const response = await fetch(httpUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Turso Batch Error ${response.status}: ${text}`)
    }

    const data = await response.json()
    console.log('[SQLite/Turso] Batch response:', JSON.stringify(data, null, 2))

    // Check for errors in results and count affected rows
    let totalAffected = 0
    for (const res of data.results) {
      if (res.type === 'error') throw new Error(res.error.message)
      if (res.type === 'ok' && res.response && res.response.result) {
        const affected = res.response.result.affected_row_count || 0
        console.log('[SQLite/Turso] Statement affected rows:', affected)
        totalAffected += affected
      }
    }
    console.log('[SQLite/Turso] Total affected rows:', totalAffected)
    return { count: totalAffected } // Return actual update count
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
}
