import { neon } from '@neondatabase/serverless'

const sql = process.env.NEON_DATABASE_URL ? neon(process.env.NEON_DATABASE_URL) : null;

export { sql }
