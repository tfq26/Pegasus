import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function debugSupport() {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) {
        console.error('NEON_DATABASE_URL not found');
        return;
    }

    try {
        const sql = neon(url);
        const tables = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;
        console.log('Tables in support DB:', tables.map(t => t.table_name));
    } catch (err) {
        console.error('Error connecting to support DB:', err);
    }
}

debugSupport();
