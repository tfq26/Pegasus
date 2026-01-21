import cron from 'node-cron';
import { db } from '../db/index.js';
import { queryHistory, users } from '../db/schema.js';
import { StorageManager } from '../services/storage/StorageManager.js';
import { sql, lt, and, eq } from 'drizzle-orm';

/**
 * Archive Query History Cron Job
 * Moves logs older than 30 days to Object Storage and deletes them from DB.
 * Schedule: Daily at 2:00 AM
 */
export async function runQueryArchival() {
    console.log('[Job] Running Query Archival...');

    try {
        // 1. Calculate Cutoff Date (30 days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        // 2. Fetch distinct users who have old logs
        // Ideally we'd do this in batch, but for now iterate users to organize files by User ID
        const usersWithLogs = await db.selectDistinct({ id: queryHistory.userId })
            .from(queryHistory)
            .where(lt(queryHistory.createdAt, cutoffDate));

        for (const { id: userId } of usersWithLogs) {
            if (!userId) continue;

            // 3. Fetch Logs for this User
            const logs = await db.select()
                .from(queryHistory)
                .where(and(
                    eq(queryHistory.userId, userId),
                    lt(queryHistory.createdAt, cutoffDate)
                ));

            if (logs.length === 0) continue;

            // 4. Serialize to JSONL
            const jsonl = logs.map(log => JSON.stringify(log)).join('\n');
            const buffer = Buffer.from(jsonl);

            // 5. Generate Path: archives/{userId}/queries/{YYYY}/{MM}/queries_{YYYY-MM-DD}_{timestamp}.jsonl
            const datePrefix = new Date().toISOString().split('T')[0];
            const year = datePrefix.split('-')[0];
            const month = datePrefix.split('-')[1];
            const key = `archives/${userId}/queries/${year}/${month}/queries_${datePrefix}_${Date.now()}.jsonl`;

            // 6. Upload
            try {
                const provider = await StorageManager.getProvider(userId);
                await provider.upload(key, buffer, 'application/x-jsonlines');

                // 7. Delete from DB
                const idsToDelete = logs.map(l => l.id);
                await db.delete(queryHistory)
                    .where(sql`${queryHistory.id} IN ${idsToDelete}`);

                console.log(`[Job] Archived ${logs.length} queries for user ${userId} to ${key}`);
            } catch (err) {
                console.error(`[Job] Failed to archive for user ${userId}:`, err);
            }
        }

        console.log('[Job] Query Archival Complete.');
    } catch (error) {
        console.error('[Job] Query Archival Error:', error);
    }
}

export function initializeQueryArchival() {
    cron.schedule('0 2 * * *', runQueryArchival);
    console.log('[Job] Query Archival initialized (Daily at 2:00 AM)');
}
