
import 'dotenv/config';
import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

async function debug() {
    const connId = "d8917089-4c61-4f7b-b747-67184d684e06";
    const userId = "user_01K8FGQG2NSJZJ7K38QFBS8CJD";
    try {
        const res = await db.execute(sql`SELECT workspace_data FROM connection_workspace WHERE user_id = ${userId} AND connection_id = ${connId}`);
        const rows = Array.isArray(res) ? res : (res.rows || []);
        if (rows.length > 0) {
            console.log("Workspace Data for", connId, ":");
            console.log(JSON.stringify(rows[0].workspace_data || rows[0].workspaceData, null, 2));
        } else {
            console.log("No workspace found for", connId);
        }
    } catch (e) {
        console.error("DEBUG FAILED:", e.message);
    }
}

debug().then(() => process.exit(0));
