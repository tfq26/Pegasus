import { sql } from '../src/db/neon.js';

async function main() {
    if (!sql) {
        console.error('Database connection not configured.');
        process.exit(1);
    }
    try {
        console.log('Resetting is_latest for all releases...');
        await sql`UPDATE releases SET is_latest = false`;

        console.log('Setting v0.8.2 as latest...');
        const result = await sql`
            UPDATE releases 
            SET is_latest = true 
            WHERE version = 'v0.8.2'
            RETURNING *
        `;

        if (result.length > 0) {
            console.log('Successfully updated:', result[0]);
        } else {
            // Fallback if v0.8.2 doesn't exist (e.g. if it was v0.8.2.0 or algo)
            console.warn('v0.8.2 not found, listing similar...');
            const similar = await sql`SELECT version FROM releases WHERE version LIKE 'v0.8.%'`;
            console.log('Found:', similar);
        }

    } catch (err) {
        console.error('Error updating release:', err);
    }
}

main();
