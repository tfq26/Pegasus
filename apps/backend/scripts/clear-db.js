import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

async function clearDb() {
    const sql = neon(process.env.DATABASE_URL);
    console.log('Force clearing database (dropping and creating public schema)...');

    try {
        await sql`DROP SCHEMA IF EXISTS public CASCADE`;
        await sql`CREATE SCHEMA public`;
        await sql`GRANT ALL ON SCHEMA public TO public`;
        await sql`COMMENT ON SCHEMA public IS 'standard public schema'`;

        // Enable vector extension if it exists
        try {
            await sql`CREATE EXTENSION IF NOT EXISTS vector`;
            console.log('Vector extension enabled');
        } catch (extErr) {
            console.warn('Could not enable vector extension (might already exist or not supported):', extErr.message);
        }

        console.log('Schema cleared and recreated');
    } catch (e) {
        console.error('Failed to clear schema:', e.message);
    }
    console.log('Done.');
}

clearDb().catch(console.error);
