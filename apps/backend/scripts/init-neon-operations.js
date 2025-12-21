import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
    console.error('NEON_DATABASE_URL is not set');
    process.exit(1);
}

const sql = neon(databaseUrl);

async function init() {
    console.log('Initializing operations table in Neon...');
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS operations (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                progress INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                details TEXT,
                error TEXT,
                started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP WITH TIME ZONE,
                duration INTEGER,
                category TEXT,
                user_id TEXT,
                group_id TEXT
            );
        `;

        console.log('Operations table created successfully or already exists.');

        // Add index for faster queries by user and started_at
        await sql`CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_operations_started_at ON operations(started_at DESC);`;

        console.log('Indexes created successfully.');
    } catch (error) {
        console.error('Failed to initialize operations table:', error);
        process.exit(1);
    }
}

init();
