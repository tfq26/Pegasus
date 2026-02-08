import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import { and, eq, lt, sql } from "drizzle-orm";
import cron from "node-cron";

export function initializeNotificationCleanup() {
    // Run every hour
    cron.schedule("0 * * * *", async () => {
        console.log("[Job] Running notification cleanup...");
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            const result = await db.delete(notifications)
                .where(
                    and(
                        eq(notifications.isRead, true),
                        lt(notifications.createdAt, oneHourAgo)
                    )
                );

            console.log(`[Job] Notification cleanup complete.`);
        } catch (error) {
            console.error("[Job] Notification cleanup failed:", error);
        }
    });
}
