import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema.js';

const supportDbUrl = process.env.NEON_DATABASE_URL || '';
const maskedUrl = supportDbUrl.replace(/\/\/.*@/, '//****:****@');
console.log(`[SupportDB] Initializing with URL: ${maskedUrl || 'EMPTY'}`);

const sql = neon(supportDbUrl);
export const supportDb = drizzle(sql, { schema });
