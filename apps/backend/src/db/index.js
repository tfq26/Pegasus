import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
const maskedUrl = dbUrl.replace(/\/\/.*@/, '//****:****@');
console.log(`[DB] Using URL: ${maskedUrl || 'EMPTY'}`);

let dbInstance;
let sqlInstance;

if (!dbUrl) {
    console.error('❌ [DB] FATAL: DATABASE_URL is missing. Database operations will fail.');
    // Export a proxy that throws on access to help debugging
    dbInstance = new Proxy({}, {
        get: (target, prop) => {
            throw new Error(`Database not initialized: DATABASE_URL is missing. Property accessed: ${String(prop)}`);
        }
    });
} else {
    try {
        console.log(`[DB] Creating Neon SQL client...`);
        sqlInstance = neon(dbUrl);
        console.log(`[DB] SQL client created.`);
        dbInstance = drizzle(sqlInstance, { schema });
        console.log(`[DB] Drizzle instance initialized.`);
    } catch (e) {
        console.error(`❌ [DB] Failed to initialize Drizzle:`, e.message);
        dbInstance = new Proxy({}, {
            get: () => { throw new Error(`Database failed to initialize: ${e.message}`); }
        });
    }
}

export const db = dbInstance;
export const sqlClient = sqlInstance; // Renamed from sql to avoid confusion
