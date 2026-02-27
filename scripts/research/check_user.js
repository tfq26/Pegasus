
import { db } from "./apps/backend/src/db/index.js";
import { users } from "./apps/backend/src/db/schema.js";
import { eq } from "drizzle-orm";

async function checkUser() {
    try {
        const [u] = await db.select().from(users).where(eq(users.email, "batsteel209@gmail.com"));
        console.log("User Info:", JSON.stringify(u, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    } catch (e) {
        console.error("User check failed:", e.message);
    }
}

checkUser();
