import { db } from "../../apps/backend/src/db/index.js";
import { chats, users } from "../../apps/backend/src/db/schema.js";
import { aiClient } from "../../apps/backend/ai/AIClient.js";
import { eq, and } from "drizzle-orm";
import crypto from 'crypto';

async function testLiveFlow() {
    try {
        console.log("--- Starting Live Flow Test ---");

        // 1. Create a dummy user if needed or get an existing one
        const user = await db.query.users.findFirst();
        if (!user) {
            console.error("No users found in database. Cannot run test.");
            return;
        }
        const userId = user.id;

        // 2. Create a new chat
        console.log("Creating new chat...");
        const [chat] = await db.insert(chats).values({
            userId,
            title: "New Chat",
            messages: [],
            updatedAt: new Date()
        }).returning();

        console.log(`Created chat ID: ${chat.id}`);

        // 3. Mock POST /chats/:id/messages for USER
        console.log("Saving mock USER message...");
        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user',
            content: 'How do I analyze the performance of my application server?',
            created_at: Math.floor(Date.now() / 1000)
        };

        await db.update(chats)
            .set({
                messages: [userMsg],
                updatedAt: new Date()
            })
            .where(eq(chats.id, chat.id));

        // 4. Mock POST /chats/:id/messages for ASSISTANT
        console.log("Saving mock ASSISTANT message and checking title trigger...");
        const assistantMsg = {
            id: crypto.randomUUID(),
            role: 'ai',
            content: 'To analyze application server performance, you should look at CPU usage, memory consumption, and request latency. I can help you query these metrics if you have a database connection set up.',
            created_at: Math.floor(Date.now() / 1000)
        };

        const existingChat = await db.query.chats.findFirst({
            where: eq(chats.id, chat.id)
        });

        const updatedMessages = [...existingChat.messages, assistantMsg];

        await db.update(chats)
            .set({
                messages: updatedMessages,
                updatedAt: new Date()
            })
            .where(eq(chats.id, chat.id));

        // Trigger logic (mimicking the route)
        let generatedTitle = null;
        const currentTitle = (existingChat.title || '').trim();
        const isDefaultTitle = currentTitle === 'New Chat' || currentTitle === '';

        if (isDefaultTitle && updatedMessages.length >= 2) {
            console.log(`[Test] Triggering title generation for length ${updatedMessages.length}...`);
            const newTitle = await aiClient.generateTitle(updatedMessages);
            if (newTitle && newTitle.trim() && newTitle.trim() !== 'New Chat') {
                generatedTitle = newTitle.trim().substring(0, 100);
                await db.update(chats).set({ title: generatedTitle }).where(eq(chats.id, chat.id));
                console.log(`[Test] SUCCESS: Updated title to: ${generatedTitle}`);
            } else {
                console.log(`[Test] AI returned invalid title: ${newTitle}`);
            }
        }

        // 5. Verify final state
        const finalChat = await db.query.chats.findFirst({
            where: eq(chats.id, chat.id)
        });

        console.log("--- Final Check ---");
        console.log(`Title: ${finalChat.title}`);
        console.log(`Message Count: ${finalChat.messages.length}`);

        if (finalChat.title !== 'New Chat') {
            console.log("STRICT TEST PASSED: Title was changed.");
        } else {
            console.log("STRICT TEST FAILED: Title is still 'New Chat'.");
        }

    } catch (e) {
        console.error("Error during live flow test:", e);
    } finally {
        process.exit(0);
    }
}

testLiveFlow();
