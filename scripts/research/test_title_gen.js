import { db } from "../../apps/backend/src/db/index.js";
import { chats } from "../../apps/backend/src/db/schema.js";
import { aiClient } from "../../apps/backend/ai/AIClient.js";
import { eq, and, sql } from "drizzle-orm";

async function testTitleGeneration() {
    try {
        // Find a recent chat with "New Chat" title and at least 2 messages
        const chat = await db.query.chats.findFirst({
            where: and(
                eq(chats.title, "New Chat")
            ),
            orderBy: (chats, { desc }) => [desc(chats.updatedAt)]
        });

        if (!chat) {
            console.log("No eligible chat found.");
            return;
        }

        console.log(`Testing title generation for chat: ${chat.id}`);
        console.log(`Current Messages: ${chat.messages.length}`);

        if (chat.messages.length < 2) {
            console.log("Chat has fewer than 2 messages. Title generation might not trigger normally, but we'll try anyway.");
        }

        console.log("Calling aiClient.generateTitle...");
        const newTitle = await aiClient.generateTitle(chat.messages);

        console.log("Result:", newTitle);

        if (newTitle && newTitle.trim() && newTitle !== 'New Chat') {
            console.log("SUCCESS: Generated new title:", newTitle);
        } else {
            console.log("FAILURE: Result was null, empty, or 'New Chat'");
        }

    } catch (e) {
        console.error("Error during test:", e);
    } finally {
        process.exit(0);
    }
}

testTitleGeneration();
