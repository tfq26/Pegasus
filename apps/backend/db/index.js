import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize database using Turso URL or local file
const url = process.env.TURSO_DB_URL || `file:${join(__dirname, "pegasus.db")}`
const authToken = process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : undefined

console.log(`[DB] Connecting to ${url.startsWith('file:') ? 'local file' : 'Turso'}`)
console.log(`[DB] URL: ${url}`)
console.log(`[DB] Token Length: ${authToken ? authToken.length : 0}`)
console.log(`[DB] Token Start: ${authToken ? authToken.substring(0, 10) + "..." : "None"}`)
console.log(`[DB] Token End: ${authToken ? "..." + authToken.substring(authToken.length - 10) : "None"}`)

// Custom DB Client using Fetch for Turso HTTP API
class CustomTursoClient {
  constructor(config) {
    this.url = config.url
    this.authToken = config.authToken
    this.isLocal = this.url.startsWith('file:')

    if (this.isLocal) {
      // Fallback to @libsql/client for local development if needed
      // But for now, we assume this is mostly for Vercel
      import("@libsql/client").then(mod => {
        this.localClient = mod.createClient({ url: this.url })
      })
    }
  }

  async execute(stmt) {
    if (this.isLocal) {
      if (!this.localClient) throw new Error("Local client not initialized yet")
      return this.localClient.execute(stmt)
    }

    // Prepare statement
    let sql, args
    if (typeof stmt === 'string') {
      sql = stmt
      args = []
    } else {
      sql = stmt.sql
      args = stmt.args || []
    }

    // Handle Named Arguments -> Positional Arguments Conversion
    if (args && !Array.isArray(args) && typeof args === 'object') {
      console.log("[DB] Converting named args to positional...")
      console.log("[DB] SQL:", sql)
      console.log("[DB] Args:", JSON.stringify(args))

      const namedValues = args
      const positionalArgs = []

      // Regex to find named parameters (e.g. $id, :name, @email)
      // We replace them with ? and push the corresponding value to positionalArgs
      sql = sql.replace(/([:@$][a-zA-Z0-9_]+)/g, (match, paramName) => {
        // paramName includes the prefix, e.g. "$id"
        // The args object might have keys with or without prefix

        // Try exact match first
        let val = namedValues[paramName]

        // If undefined, try without prefix
        if (val === undefined) {
          const cleanName = paramName.substring(1)
          val = namedValues[cleanName]
        }

        if (val === undefined) {
          console.warn(`[DB] Warning: Missing value for parameter ${paramName}`)
          return match // Keep it if we can't find it (will likely error)
        }

        positionalArgs.push(val)
        return "?"
      })

      args = positionalArgs
    }

    // Construct the HTTP URL
    const httpUrl = this.url.replace("libsql://", "https://") + "/v2/pipeline"

    const requestBody = {
      requests: [
        {
          type: "execute",
          stmt: {
            sql: sql,
            args: this.formatArgs(args)
          }
        },
        { type: "close" }
      ]
    }

    const response = await fetch(httpUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Turso Error ${response.status}: ${text}`)
    }

    const data = await response.json()
    const result = data.results[0] // First result is the execute

    if (result.type === 'error') {
      throw new Error(`Turso Query Error: ${result.error.message}`)
    }

    return {
      rows: this.parseRows(result.response.result),
      rowsAffected: result.response.result.affected_row_count,
      lastInsertRowid: result.response.result.last_insert_rowid
    }
  }

  // Helper to format args for Turso API
  formatArgs(args) {
    if (Array.isArray(args)) {
      return args.map(val => this.formatValue(val))
    } else if (typeof args === 'object' && args !== null) {
      // Named arguments
      const named = {}
      for (const [key, val] of Object.entries(args)) {
        named[key] = this.formatValue(val)
      }
      return named
    }
    return []
  }

  formatValue(val) {
    if (val === null) return { type: "null" }
    if (typeof val === 'number') return { type: "float", value: val } // or integer/float detection
    if (typeof val === 'boolean') return { type: "integer", value: val ? "1" : "0" }
    if (val instanceof Uint8Array) return { type: "blob", base64: Buffer.from(val).toString('base64') }
    return { type: "text", value: String(val) }
  }

  // Helper to parse rows from Turso API format to standard objects
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
}

export const db = new CustomTursoClient({
  url,
  authToken
})

// Initialize tables
const initDb = async () => {
  try {
    // Users Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        first_name TEXT,
        last_name TEXT,
        profile_picture_url TEXT,
        subscription_tier TEXT DEFAULT 'free',
        stripe_customer_id TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    // Dashboards Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS dashboards (
        user_id TEXT PRIMARY KEY,
        layout TEXT,
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Connections Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        nickname TEXT,
        description TEXT,
        provider TEXT,
        config TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // User Settings Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        settings TEXT,
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Chats Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        messages TEXT DEFAULT '[]',
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Migration: Add messages column to chats if it doesn't exist
    try {
      await db.execute("ALTER TABLE chats ADD COLUMN messages TEXT DEFAULT '[]'")
    } catch (e) {
      // Ignore error if column already exists
    }

    // Messages Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT,
        role TEXT, -- 'user' or 'ai'
        content TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    // Dashboard Elements Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS dashboard_elements (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT, -- 'bar', 'line', 'pie', etc.
        title TEXT,
        config TEXT, -- JSON configuration for the chart
        query TEXT, -- The SQL query used to generate data
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Queries History Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS queries (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        query TEXT,
        source TEXT, -- 'user' or 'ai'
        model TEXT, -- e.g. 'gemini-pro', 'gpt-4'
        status TEXT, -- 'success' or 'error'
        connection_id TEXT,
        tokens_used INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Migration: Add model column if it doesn't exist (for existing tables)
    try {
      await db.execute("ALTER TABLE queries ADD COLUMN model TEXT")
    } catch (e) {
      // Ignore error if column already exists
    }

    // Migration: Add tokens_used column if it doesn't exist
    try {
      await db.execute("ALTER TABLE queries ADD COLUMN tokens_used INTEGER DEFAULT 0")
    } catch (e) {
      // Ignore error if column already exists
    }

    // Dashboards V2 Table (Multi-dashboard support)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS dashboards_v2 (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        data TEXT, -- JSON blob: { layout: [...], elements: [...] }
        share_token TEXT UNIQUE,
        is_public BOOLEAN DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

    // Migration: Move v1 data to v2
    try {
      const v2Check = await db.execute("SELECT count(*) as count FROM dashboards_v2")
      const count = Number(v2Check.rows[0]?.count) || 0

      if (count === 0) {
        console.log("[DB] Migrating legacy dashboards to v2...")
        const usersRs = await db.execute("SELECT id FROM users")

        for (const user of usersRs.rows) {
          const userId = user.id

          // Get Layout
          const layoutRs = await db.execute({
            sql: "SELECT layout FROM dashboards WHERE user_id = $userId",
            args: { userId }
          })
          const layout = layoutRs.rows[0]?.layout ? JSON.parse(layoutRs.rows[0].layout) : []

          // Get Elements
          const elementsRs = await db.execute({
            sql: "SELECT * FROM dashboard_elements WHERE user_id = $userId",
            args: { userId }
          })

          if (elementsRs.rows.length > 0 || layout.length > 0) {
            const elements = elementsRs.rows.map((row) => ({
              id: row.id,
              type: row.type,
              title: row.title,
              config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
              query: row.query
            }))

            const dashboardId = crypto.randomUUID()
            const data = JSON.stringify({ layout, elements })

            await db.execute({
              sql: `INSERT INTO dashboards_v2 (id, user_id, title, data) VALUES ($id, $userId, 'Default Dashboard', $data)`,
              args: {
                id: dashboardId,
                userId,
                data
              }
            })
            console.log(`[DB] Migrated dashboard for user ${userId}`)
          }
        }
      }
    } catch (e) {
      console.error("[DB] Migration failed:", e)
    }

    console.log("[DB] Tables initialized")
  } catch (e) {
    console.error("[DB] Failed to initialize tables:", e)
  }
}

initDb()
