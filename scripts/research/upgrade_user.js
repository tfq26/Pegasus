
import { db } from "./apps/backend/src/db/index.js";
import { users } from "./apps/backend/src/db/schema.js";
import { eq } from "drizzle-orm";

async function upgradeUser() {
    try {
        await db.update(users)
            .set({ subscriptionTier: "pro_plus", updatedAt: new Date() })
            .where(eq(users.email, "batsteel209@gmail.com"));
        console.log("✅ User batsteel209@gmail.com upgraded to pro_plus");
    } catch (e) {
        console.error("Upgrade failed:", e.message);
    }
}

upgradeUser();
