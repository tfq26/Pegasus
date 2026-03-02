import { db } from "./src/db/index.js";
import { sql } from "drizzle-orm";

async function check() {
    try {
        const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        console.log("Tables in DB:", result.rows.map(r => r.table_name));
    } catch (e) {
        console.error("Check failed:", e.message);
    }
}

check();
