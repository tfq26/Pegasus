
import { db } from "./apps/backend/src/db/index.js";
import { connections } from "./apps/backend/src/db/schema.js";

async function checkConnections() {
    try {
        const allConns = await db.select().from(connections);
        console.log("Registered Connections:");
        allConns.forEach(c => {
            console.log(` - ID: ${c.id}`);
            console.log(`   Name: ${c.name}`);
            console.log(`   Provider: ${c.provider}`);
            console.log(`   Config: ${JSON.stringify(c.config)}`);
        });
    } catch (e) {
        console.error("DB check failed:", e.message);
    }
}

checkConnections();
