import { createClient } from "@libsql/client"
// Load env vars via Bun or process
// dotenv removed

const url = process.env.TURSO_DB_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url || !authToken) {
    console.error("Missing TURSO_DB_URL or TURSO_AUTH_TOKEN in apps/backend/.env")
    process.exit(1)
}

// Convert libsql:// to https:// for better compatibility if needed
const httpUrl = url.replace("libsql://", "https://")

console.log(`Connecting to Turso: ${httpUrl}`)

const db = createClient({
    url: httpUrl,
    authToken: authToken.trim(),
})

async function seed() {
    try {
        console.log("Creating tables...")

        // Sample Users
        await db.execute(`
            CREATE TABLE IF NOT EXISTS sample_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                city TEXT,
                state TEXT,
                status TEXT DEFAULT 'active'
            )
        `)

        // Sample Orders
        await db.execute(`
            CREATE TABLE IF NOT EXISTS sample_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product TEXT,
                amount REAL,
                order_date TEXT,
                FOREIGN KEY (user_id) REFERENCES sample_users(id)
            )
        `)

        // Sample Teams
        await db.execute(`
            CREATE TABLE IF NOT EXISTS sample_teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_name TEXT NOT NULL,
                city TEXT,
                state TEXT,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0
            )
        `)

        console.log("Inserting data...")

        // Users
        const users = [
            ['John Doe', 'john@example.com', 'Albuquerque', 'New Mexico', 'active'],
            ['Jane Smith', 'jane@example.com', 'Santa Fe', 'New Mexico', 'active'],
            ['Bob Johnson', 'bob@example.com', 'Chicago', 'Illinois', 'inactive'],
            ['Alice Williams', 'alice@example.com', 'Phoenix', 'Arizona', 'active'],
            ['Charlie Brown', 'charlie@example.com', 'Las Cruces', 'New Mexico', 'active']
        ]

        for (const u of users) {
            await db.execute({
                sql: 'INSERT INTO sample_users (name, email, city, state, status) VALUES (?, ?, ?, ?, ?)',
                args: u
            })
        }

        // Orders
        const orders = [
            [1, 'Laptop', 999.99, '2024-01-15'],
            [1, 'Mouse', 29.99, '2024-01-16'],
            [2, 'Keyboard', 79.99, '2024-01-20'],
            [3, 'Monitor', 299.99, '2024-02-01'],
            [4, 'Headphones', 149.99, '2024-02-05']
        ]

        for (const o of orders) {
            await db.execute({
                sql: 'INSERT INTO sample_orders (user_id, product, amount, order_date) VALUES (?, ?, ?, ?)',
                args: o
            })
        }

        // Teams
        const teams = [
            ['Albuquerque Aces', 'Albuquerque', 'New Mexico', 12, 3],
            ['Santa Fe Strikers', 'Santa Fe', 'New Mexico', 8, 7],
            ['Chicago Bulls', 'Chicago', 'Illinois', 15, 2],
            ['Phoenix Suns', 'Phoenix', 'Arizona', 10, 5],
            ['Las Cruces Lightning', 'Las Cruces', 'New Mexico', 6, 9]
        ]

        for (const t of teams) {
            await db.execute({
                sql: 'INSERT INTO sample_teams (team_name, city, state, wins, losses) VALUES (?, ?, ?, ?, ?)',
                args: t
            })
        }

        console.log("✅ Seed complete! Tables created: sample_users, sample_orders, sample_teams")

    } catch (e) {
        console.error("Seed failed:", e)
    }
}

seed()
