import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function createSupportTable() {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) {
        console.error('NEON_DATABASE_URL not found');
        return;
    }

    try {
        const sql = neon(url);
        console.log('Creating support_report table...');
        await sql`
            CREATE TABLE IF NOT EXISTS support_report (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id TEXT,
                url TEXT,
                error_code TEXT,
                error_message TEXT,
                error_details TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        console.log('Table created successfully!');
    } catch (err) {
        console.error('Error creating table:', err);
    }
}

createSupportTable();
