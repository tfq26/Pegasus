import { createClient } from "@libsql/client"
import { join } from "path"

// Initialize database using Turso URL or local file
const url = process.env.TURSO_DB_URL || `file:${join(import.meta.dir, "pegasus.db")}`
const authToken = process.env.TURSO_AUTH_TOKEN

console.log(`[DB] Connecting to ${url.startsWith('file:') ? 'local file' : 'Turso'}`)

export const db = createClient({
  url,
  authToken,
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
          const userId = user.id as string

          // Get Layout
          const layoutRs = await db.execute({
            sql: "SELECT layout FROM dashboards WHERE user_id = $userId",
            args: { userId }
          })
          const layout = layoutRs.rows[0]?.layout ? JSON.parse(layoutRs.rows[0].layout as string) : []

          // Get Elements
          const elementsRs = await db.execute({
            sql: "SELECT * FROM dashboard_elements WHERE user_id = $userId",
            args: { userId }
          })

          if (elementsRs.rows.length > 0 || layout.length > 0) {
            const elements = elementsRs.rows.map((row: any) => ({
              id: row.id,
              type: row.type,
              title: row.title,
              config: typeof row.config === 'string' ? JSON.parse(row.config as string) : row.config,
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
