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
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `)

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

    console.log("[DB] Tables initialized")
  } catch (e) {
    console.error("[DB] Failed to initialize tables:", e)
  }
}

initDb()
