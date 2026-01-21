import cron from 'node-cron';
import { db } from '../db/index.js';
import { chats } from '../db/schema.js';
import { StorageManager } from '../services/storage/StorageManager.js';
import { sql, lt, and, eq, isNotNull, isNull } from 'drizzle-orm';

/**
 * Archive Chat History Cron Job
 * Offloads inactive chats (>7 days since update) to Object Storage.
 * Keeps chat metadata in DB but clears 'messages' (if used) or marks as archived.
 * Schedule: Weekly at 3:00 AM on Sundays.
 */
export async function runChatArchival() {
    console.log('[Job] Running Chat Archival...');

    try {
        // 1. Calculate Cutoff Date (7 days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        // 2. Fetch Inactive Chats not yet archived
        // "Inactive" = updatedAt < 7 days ago AND storageId IS NULL
        const inactiveChats = await db.select()
            .from(chats)
            .where(and(
                lt(chats.updatedAt, cutoffDate),
                isNull(chats.storageId)
            ))
            .limit(50); // Batch limit to prevent memory spikes

        if (inactiveChats.length === 0) {
            console.log('[Job] No chats to archive.');
            return;
        }

        console.log(`[Job] Found ${inactiveChats.length} chats to archive.`);

        for (const chat of inactiveChats) {
            const userId = chat.userId;
            if (!userId) continue;

            // 3. Prepare Snapshot Data
            // Fetch full message history if stored in a separate table?
            // Currently schema says 'messages' might be JSONB in 'chats' table or separate 'messages' table.
            // Let's assume we fetch all messages related to this chat.

            const chatMessages = await db.select()
                .from(messages)
                .where(eq(messages.chatId, chat.id))
                .orderBy(messages.createdAt);

            const snapshot = {
                ...chat,
                messages: chatMessages,
                archivedAt: new Date().toISOString()
            };

            const content = JSON.stringify(snapshot);
            const buffer = Buffer.from(content);
            const key = `archives/${userId}/chats/${chat.id}_v${Date.now()}.json`;

            // 4. Upload to Storage
            try {
                const provider = await StorageManager.getProvider(userId);
                await provider.upload(key, buffer, 'application/json');

                // 5. Update DB: Set storageId, Clear content?
                // We can't delete the chat row because the user might want to see history list.
                // We set storageId. The 'messages' rows can be deleted?
                // YES. If archived, we delete rows from 'messages' table to save space.

                await db.transaction(async (tx) => {
                    // Update Chat Record
                    await tx.update(chats)
                        .set({
                            storageId: key,
                            updatedAt: new Date() // Updates timestamp but that's fine, it won't be picked up again due to storageId NOT NULL check
                        })
                        .where(eq(chats.id, chat.id));

                    // Delete Messages
                    await tx.delete(messages)
                        .where(eq(messages.chatId, chat.id));
                });

                console.log(`[Job] Archived chat ${chat.id} to ${key}`);

            } catch (err) {
                console.error(`[Job] Failed to archive chat ${chat.id}:`, err);
            }
        }

        console.log('[Job] Chat Archival Complete.');

    } catch (error) {
        console.error('[Job] Chat Archival Error:', error);
    }
}

export function initializeChatArchival() {
    cron.schedule('0 3 * * 0', runChatArchival);
    console.log('[Job] Chat Archival initialized (Weekly at 3:00 AM Sundays)');
}
