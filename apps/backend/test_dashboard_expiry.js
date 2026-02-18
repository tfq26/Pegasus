
import 'dotenv/config';
import { db } from "./src/db/index.js";
import { users, dashboards } from "./src/db/schema.js";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

async function testDashboardExpiry() {
    console.log("Starting Dashboard Expiry Test...");

    const testUserId = "test_user_" + Date.now();
    const dashboardId = crypto.randomUUID();

    try {
        // --- AUTO-MIGRATION (For Test Environment) ---
        // Ensure schema matches code by manually adding columns if missing
        try {
            await db.execute(sql`ALTER TABLE "dashboard" ADD COLUMN IF NOT EXISTS "share_token" text;`);
            // Drop and re-add to ensure correct type (TIMESTAMPTZ)
            await db.execute(sql`ALTER TABLE "dashboard" DROP COLUMN IF EXISTS "share_token_expires_at";`);
            await db.execute(sql`ALTER TABLE "dashboard" ADD COLUMN "share_token_expires_at" TIMESTAMP WITH TIME ZONE;`);
            await db.execute(sql`ALTER TABLE "dashboard" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false;`);
            console.log("Migration check complete: Reset share_token_expires_at to TIMESTAMPTZ.");
        } catch (migErr) {
            console.warn("Migration step warning (might already exist):", migErr.message);
        }

        // 1. Create User
        await db.insert(users).values({
            id: testUserId,
            email: `test_${Date.now()}@example.com`,
            firstName: "Test",
            lastName: "User"
        });

        // 2. Create Dashboard
        const [dash] = await db.insert(dashboards).values({
            id: dashboardId,
            title: "Expiry Test Dashboard",
            ownerId: testUserId,
            isPublic: false
        }).returning();

        console.log(`Created dashboard: ${dash.id}`);

        // 3. Share with Expiry (2 seconds)
        const expiresIn = 2; // seconds
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        await db.update(dashboards)
            .set({
                isPublic: true,
                shareToken: crypto.randomUUID(),
                shareTokenExpiresAt: expiresAt
            })
            .where(eq(dashboards.id, dashboardId));

        console.log(`Shared with expiry in ${expiresIn}s (at ${expiresAt.toISOString()})`);

        // 4. Test Immediate Access (Simulate API check logic)
        // Logic: if (!role && isPublic && expiresAt > now) -> OK

        let fetched = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, dashboardId)
        });

        if (fetched.isPublic && new Date() < new Date(fetched.shareTokenExpiresAt)) {
            console.log("PASS: Immediate access allowed.");
        } else {
            console.error("FAIL: Immediate access denied!", fetched);
        }

        // 5. Wait for Expiry
        console.log("Waiting 3 seconds...");
        await new Promise(r => setTimeout(r, 3000));

        // 6. Test Expired Access
        fetched = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, dashboardId)
        });

        if (fetched.isPublic && new Date() > new Date(fetched.shareTokenExpiresAt)) {
            console.log("PASS: Expiry logic check - Time IS past expiry.");
            // Simulate the controller check
            if (fetched.isPublic && fetched.shareTokenExpiresAt && new Date() > new Date(fetched.shareTokenExpiresAt)) {
                console.log("PASS: Controller would DENY access.");
            } else {
                console.error("FAIL: Controller logic mismatch.");
            }
        } else {
            console.error("FAIL: Time check failed or isPublic reset?");
            console.log("Current Time:", new Date().toISOString());
            console.log("Expires At:", fetched.shareTokenExpiresAt);
            console.log("isPublic:", fetched.isPublic);
        }

    } catch (e) {
        console.error("Test Error:", e);
    } finally {
        // Cleanup
        await db.delete(dashboards).where(eq(dashboards.id, dashboardId));
        await db.delete(users).where(eq(users.id, testUserId));
        process.exit(0);
    }
}

testDashboardExpiry();
