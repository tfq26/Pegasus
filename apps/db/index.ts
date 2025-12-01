import { Database } from "bun:sqlite"
import { join } from "path"

// Initialize database using path from root env file
const dbName = process.env.DATABASE_NAME || "pegasus.db"
export const dbPath = join(import.meta.dir, dbName)
const db = new Database(dbPath)

// Initialize tables
// Users Table
db.run(`
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
db.run(`
  CREATE TABLE IF NOT EXISTS dashboards (
    user_id TEXT PRIMARY KEY,
    layout TEXT,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`)

// Connections Table
db.run(`
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
db.run(`
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    settings TEXT,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`)

export { db }
