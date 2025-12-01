import { Database } from "bun:sqlite"

// Initialize database
const db = new Database("pegasus.db")

// Initialize tables
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

db.run(`
  CREATE TABLE IF NOT EXISTS dashboards (
    user_id TEXT PRIMARY KEY,
    layout TEXT,
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )
`)

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

export { db }
