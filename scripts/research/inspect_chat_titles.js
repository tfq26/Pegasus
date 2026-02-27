import { db } from "../../apps/backend/src/db/index.js";
import { chats } from "../../apps/backend/src/db/schema.js";
import { desc } from "drizzle-orm";

async function checkChats() {
    try {
        const results = await db.select({
            id: chats.id,
            title: chats.title,
            updatedAt: chats.updatedAt,
            messageCount: sql`jsonb_array_length(${chats.messages})`
        })
            .from(chats)
            .orderBy(desc(chats.updatedAt))
            .limit(10);

        console.log("Recent Chats:");
        console.table(results);
    } catch (e) {
        console.error("Error checking chats:", e);
    } finally {
        process.exit(0);
    }
}

// Since we need 'sql' which might not be imported directly in this scratch script
import { sql } from "drizzle-orm";

checkChats();
