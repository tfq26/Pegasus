import { DatabaseAdapter } from "./DatabaseAdapter.js"
import { createClient } from "@libsql/client"
import path from "node:path"
import { resolveDatabasePath } from "../src/utils/resolveDatabasePath.js"

export class SQLiteAdapter extends DatabaseAdapter {
  async connect() {
    // Connection can be a file path, ':memory:', or a remote URL (Turso)
    const dbPath = this.connection.database || this.connection.path || ':memory:'
    const authToken = this.connection.authToken || this.connection.password

    let url = dbPath
    if (dbPath !== ':memory:') {
      url = await resolveDatabasePath(dbPath, this.userId);
      // Prepare 'file:' prefix for local paths if not already remote
      if (!url.startsWith('http') && !url.startsWith('libsql') && !url.startsWith('file:')) {
        url = `file:${url}`;
      }
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

  /**
   * Provides an async iterator over query results.
   * For SQLite, we currently fetch all then yield for simplicity, 
   * but could be extended to use paged fetching for very large datasets.
   */
  async *queryStream(query) {
    console.log(`[SQLite] Streaming query: ${query}`);
    const rows = await this.query(query);
    if (Array.isArray(rows)) {
      for (const row of rows) {
        yield row;
      }
    } else {
      yield rows; // Synthetic result for mutations
    }
  }

  /**
   * Apply a batch of atomic operations (Spreadsheet delta updates)
   */
  async applyOperations(tableName, operations) {
    console.log(`[SQLite] Applying ${operations.length} operations to ${tableName}`);
    const queries = [];

    for (const op of operations) {
      switch (op.type) {
        case 'full_replacement': {
          queries.push(`DELETE FROM "${tableName}"`);
          if (op.rows && op.rows.length > 0) {
            for (const row of op.rows) {
              const keys = Object.keys(row).filter(k => k !== '__id' && k !== '_rowid_');
              const cols = keys.map(k => `"${k}"`).join(', ');
              const vals = keys.map(k => row[k] === null ? 'NULL' : `'${String(row[k]).replace(/'/g, "''")}'`).join(', ');
              queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`);
            }
          }
          break;
        }

        case 'create': {
          const data = op.data || {};
          const keys = Object.keys(data).filter(k => k !== '__id' && k !== '_rowid_');
          if (keys.length > 0) {
            const cols = keys.map(k => `"${k}"`).join(', ');
            const vals = keys.map(k => data[k] === null ? 'NULL' : `'${String(data[k]).replace(/'/g, "''")}'`).join(', ');
            queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`);
          }
          break;
        }

        case 'update': {
          const id = op.id;
          const changes = op.changes || {};
          const setClause = Object.keys(changes)
            .filter(k => k !== '__id' && k !== '_rowid_')
            .map(k => `"${k}" = ${changes[k] === null ? 'NULL' : `'${String(changes[k]).replace(/'/g, "''")}'`}`)
            .join(', ');

          if (setClause && id) {
            // Check if id is number (rowid) or string (UUID)
            const idValue = typeof id === 'number' ? id : `'${String(id).replace(/'/g, "''")}'`;
            const idCol = typeof id === 'number' ? 'rowid' : 'id'; // Heuristic
            queries.push(`UPDATE "${tableName}" SET ${setClause} WHERE ${idCol} = ${idValue}`);
          }
          break;
        }

        case 'delete': {
          if (op.id) {
            const idValue = typeof op.id === 'number' ? op.id : `'${String(op.id).replace(/'/g, "''")}'`;
            const idCol = typeof op.id === 'number' ? 'rowid' : 'id';
            queries.push(`DELETE FROM "${tableName}" WHERE ${idCol} = ${idValue}`);
          }
          break;
        }

        case 'add_column': {
          if (op.column) {
            queries.push(`ALTER TABLE "${tableName}" ADD COLUMN "${op.column}" TEXT`);
          }
          break;
        }

        case 'drop_column': {
          if (op.column) {
            queries.push(`ALTER TABLE "${tableName}" DROP COLUMN "${op.column}"`);
          }
          break;
        }
      }
    }

    if (queries.length > 0) {
      await this.batch(queries);
    }
  }

  async listCollections() {
    try {
      const result = await this.db.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'"
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
      const tables = await this.listCollections();
      const schema = {}

      for (const tableName of tables) {
        schema[tableName] = await this.getOneTableSchema(tableName);
      }

      return schema
    } catch (e) {
      console.error('[SQLite] Error fetching schema:', e)
      return {}
    }
  }

  async getOneTableSchema(tableName) {
    try {
      const colResult = await this.db.execute(`PRAGMA table_info("${tableName}")`)
      return colResult.rows.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        pk: col.pk > 0
      }))
    } catch (e) {
      console.error(`[SQLite] Error fetching schema for table ${tableName}:`, e)
      return []
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

  async explain(query) {
    console.log(`[SQLite] Explaining query: ${query.substring(0, 50)}...`);
    try {
      // libSQL / SQLite standard
      const result = await this.db.execute(`EXPLAIN QUERY PLAN ${query}`);
      return result.rows;
    } catch (error) {
      console.error(`[SQLite] Explain failed:`, error);
      throw new Error(`SQLite explain error: ${error.message}`);
    }
  }

  async getProfile(tableName) {
    console.log(`[SQLite] Generating profile for table: ${tableName}`);
    try {
      const columns = await this.getOneTableSchema(tableName);
      if (columns.length === 0) return { tableName, columns: [] };

      const columnNames = columns.map(c => c.name);

      let selectParts = ['COUNT(*) as total_count'];
      columnNames.forEach(col => {
        const escaped = `"${col}"`;
        selectParts.push(`COUNT(${escaped}) as "${col}_non_null"`);
        selectParts.push(`COUNT(DISTINCT ${escaped}) as "${col}_distinct"`);
        selectParts.push(`MIN(${escaped}) as "${col}_min"`);
        selectParts.push(`MAX(${escaped}) as "${col}_max"`);
      });

      const result = await this.db.execute(`SELECT ${selectParts.join(', ')} FROM "${tableName}"`);
      const stats = result.rows[0];
      const totalCount = Number(stats.total_count);

      const profile = {
        tableName,
        rowCount: totalCount,
        columns: columns.map(col => {
          const name = col.name;
          return {
            name,
            type: col.type,
            nullCount: totalCount - Number(stats[`${name}_non_null`]),
            distinctCount: Number(stats[`${name}_distinct`]),
            min: stats[`${name}_min`],
            max: stats[`${name}_max`]
          };
        })
      };

      return profile;
    } catch (e) {
      console.error(`[SQLite] Profile failed for ${tableName}:`, e.message);
      throw e;
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
