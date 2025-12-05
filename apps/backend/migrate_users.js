import { Database } from "bun:sqlite";
import path from "node:path";

const dbPath = path.join(process.cwd(), "apps/backend/db/pegasus.db");
const db = new Database(dbPath);

try {
    console.log("Migrating users table...");

    // Check if columns exist
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasTier = tableInfo.some(col => col.name === 'subscription_tier');
    const hasStripeId = tableInfo.some(col => col.name === 'stripe_customer_id');

    if (!hasTier) {
        console.log("Adding subscription_tier column...");
        db.run("ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free'");
    } else {
        console.log("subscription_tier column already exists.");
    }

    if (!hasStripeId) {
        console.log("Adding stripe_customer_id column...");
        db.run("ALTER TABLE users ADD COLUMN stripe_customer_id TEXT");
    } else {
        console.log("stripe_customer_id column already exists.");
    }

    console.log("Migration complete.");
} catch (error) {
    console.error("Migration failed:", error);
}
