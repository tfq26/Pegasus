
import { db } from '../src/db/index.js';
import { dashboards } from '../src/db/schema.js';
import { StorageManager } from '../services/storage/StorageManager.js';
import { isNull, isNotNull, eq } from 'drizzle-orm';

async function migrate() {
    console.log("Starting Dashboard Offloading Migration...");

    // Fetch dashboards with config but no storageId
    const candidates = await db.select().from(dashboards)
        .where(isNull(dashboards.storageId)); // We process all, assuming we want to migrate everything

    console.log(`Found ${candidates.length} dashboards to process.`);

    let success = 0;
    let fail = 0;

    for (const dash of candidates) {
        try {
            if (!dash.config && !dash.messages) {
                console.log(`Skipping Dashboard ${dash.id} (No content)`);
                continue;
            }

            console.log(`Migrating Dashboard: ${dash.title} (${dash.id})`);

            // Construct payload
            // We combine config and messages if we decide to offload both.
            // For now, sticking to config as primary target, but let's include messages if present
            const payload = {
                ...(dash.config || {}),
                // messages: dash.messages // Uncomment if offloading messages
            };

            const key = `dashboards/${dash.id}/data.json`;
            const provider = await StorageManager.getProvider(dash.ownerId);

            await provider.upload(key, JSON.stringify(payload), 'application/json');

            // Update DB
            await db.update(dashboards)
                .set({
                    storageId: key,
                    config: null,
                    // messages: null // Uncomment if offloading messages
                })
                .where(eq(dashboards.id, dash.id));

            success++;
        } catch (e) {
            console.error(`Failed to migrate ${dash.id}:`, e);
            fail++;
        }
    }

    console.log(`Migration Complete. Success: ${success}, Failed: ${fail}`);
    process.exit(0);
}

migrate();
