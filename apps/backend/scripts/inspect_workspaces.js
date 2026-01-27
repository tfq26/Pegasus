import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Correct path to apps/backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

import { db } from '../src/db/index.js';
import { connectionWorkspaces } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function dumpWorkspaces() {
    try {
        const userId = "user_01K8FGQG2NSJZJ7K38QFBS8CJD";
        const ws = await db.select().from(connectionWorkspaces).where(eq(connectionWorkspaces.userId, userId));
        console.log(`Found ${ws.length} workspaces.`);

        ws.forEach(w => {
            let data = w.workspaceData;
            // Sometimes jsonb comes as string in some drivers
            if (typeof data === 'string') data = JSON.parse(data);

            const tabs = data.tabs || data.config?.tabs || [];
            if (tabs.length > 0) {
                console.log(`\n--- Workspace ${w.connectionId} (${tabs.length} tabs) ---`);
                tabs.forEach(t => {
                    const conn = t.data?.source?.connection || t.config?.connection || t.connection;
                    const name = t.label || conn?.name || t.data?.source?.table;
                    const pathVal = conn?.path || conn?.config?.path || t.data?.source?.path;
                    const type = conn?.type || t.type;

                    console.log(`Tab: ${name}, Type: ${type}, Path: ${pathVal || 'NONE'}`);
                });
            }
        });
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

dumpWorkspaces();
