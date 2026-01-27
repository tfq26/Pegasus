import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not found in environment.");
        process.exit(1);
    }

    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql);

    try {
        console.log("Running migration...");
        // Use raw SQL string for neon execution
        await sql`ALTER TABLE "file" ADD COLUMN IF NOT EXISTS "description" text;`;
        console.log("Migration successful: Added 'description' column to 'file' table.");
    } catch (e) {
        console.error("Migration failed:", e);
    }
    process.exit(0);
}

run();
