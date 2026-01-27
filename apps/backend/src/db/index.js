import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

const dbUrl = process.env.DATABASE_URL || '';
const maskedUrl = dbUrl.replace(/\/\/.*@/, '//****:****@');
console.log(`[DB] Initializing with URL: ${maskedUrl || 'EMPTY'}`);

const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });
