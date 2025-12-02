import { Database } from 'bun:sqlite'

// Create a persistent SQLite database with sample data
const db = new Database('./test-data.db')

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    city TEXT,
    state TEXT,
    status TEXT DEFAULT 'active'
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product TEXT,
    amount REAL,
    order_date TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0
  )
`)

// Insert sample data
const insertUser = db.prepare('INSERT INTO users (name, email, city, state, status) VALUES (?, ?, ?, ?, ?)')
const insertOrder = db.prepare('INSERT INTO orders (user_id, product, amount, order_date) VALUES (?, ?, ?, ?)')
const insertTeam = db.prepare('INSERT INTO teams (team_name, city, state, wins, losses) VALUES (?, ?, ?, ?, ?)')

// Users
insertUser.run('John Doe', 'john@example.com', 'Albuquerque', 'New Mexico', 'active')
insertUser.run('Jane Smith', 'jane@example.com', 'Santa Fe', 'New Mexico', 'active')
insertUser.run('Bob Johnson', 'bob@example.com', 'Chicago', 'Illinois', 'inactive')
insertUser.run('Alice Williams', 'alice@example.com', 'Phoenix', 'Arizona', 'active')
insertUser.run('Charlie Brown', 'charlie@example.com', 'Las Cruces', 'New Mexico', 'active')

// Orders
insertOrder.run(1, 'Laptop', 999.99, '2024-01-15')
insertOrder.run(1, 'Mouse', 29.99, '2024-01-16')
insertOrder.run(2, 'Keyboard', 79.99, '2024-01-20')
insertOrder.run(3, 'Monitor', 299.99, '2024-02-01')
insertOrder.run(4, 'Headphones', 149.99, '2024-02-05')

// Teams
insertTeam.run('Albuquerque Aces', 'Albuquerque', 'New Mexico', 12, 3)
insertTeam.run('Santa Fe Strikers', 'Santa Fe', 'New Mexico', 8, 7)
insertTeam.run('Chicago Bulls', 'Chicago', 'Illinois', 15, 2)
insertTeam.run('Phoenix Suns', 'Phoenix', 'Arizona', 10, 5)
insertTeam.run('Las Cruces Lightning', 'Las Cruces', 'New Mexico', 6, 9)

db.close()

const absolutePath = import.meta.dir + '/test-data.db'

console.log('✅ Test SQLite database created successfully!')
console.log('\nTables created:')
console.log('  - users (5 records)')
console.log('  - orders (5 records)')
console.log('  - teams (5 records)')
console.log('\nSample queries to try:')
console.log('  - "Show me all users from New Mexico"')
console.log('  - "Which teams are from New Mexico?"')
console.log('  - "List all orders over $100"')
console.log('  - "Show active users with their orders"')
console.log('\n✅ Database saved to: ' + absolutePath)
console.log('\nConnection details for Pegasus UI:')
console.log('  Provider: sqlite')
console.log('  Database Path: ' + absolutePath)
