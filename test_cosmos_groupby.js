
import { CosmosAdapter } from './apps/backend/adapters/cosmosAdapter.js';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/backend/.env' });

async function testGroupByExpr() {
    const adapter = new CosmosAdapter({
        endpoint: process.env.COSMOS_ENDPOINT,
        key: process.env.COSMOS_KEY,
        database: process.env.COSMOS_DATABASE,
        container: 'OrionMetrics'
    });

    await adapter.connect();

    // Test 1: Simple Group By Property (Should work)
    console.log("\n[Test 1] GROUP BY status...");
    try {
        const res1 = await adapter.query("SELECT c.status, COUNT(1) as count FROM c GROUP BY c.status");
        console.log("Success! Found", res1.length, "groups.");
    } catch (e) {
        console.error("Test 1 Failed:", e.message);
    }

    // Test 2: Group By SUBSTRING (Expression)
    console.log("\n[Test 2] GROUP BY SUBSTRING(c.timestamp, 0, 10)...");
    try {
        const res2 = await adapter.query("SELECT SUBSTRING(c.timestamp, 0, 10) AS day, COUNT(1) as count FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10)");
        console.log("Success! Found", res2.length, "groups.");
    } catch (e) {
        console.error("Test 2 Failed:", e.message);
    }

    // Test 3: DateTimePart (if SUBSTRING fails)
    console.log("\n[Test 3] GROUP BY DateTimePart('year', c.timestamp)...");
    try {
        const res3 = await adapter.query("SELECT DateTimePart('year', c.timestamp) AS yr, COUNT(1) as count FROM c GROUP BY DateTimePart('year', c.timestamp)");
        console.log("Success! Found", res3.length, "groups.");
    } catch (e) {
        console.error("Test 3 Failed:", e.message);
    }

    // Test 4: ORDER BY Expression (Suspicious)
    console.log("\n[Test 4] ORDER BY SUBSTRING(c.timestamp, 0, 10)...");
    try {
        const res4 = await adapter.query("SELECT SUBSTRING(c.timestamp, 0, 10) AS day, COUNT(1) as count FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10) ORDER BY SUBSTRING(c.timestamp, 0, 10)");
        console.log("Success! Found", res4.length, "groups.");
    } catch (e) {
        console.error("Test 4 Failed:", e.message);
    }

    // Test 5: ORDER BY Alias (Should work if 4 fails)
    console.log("\n[Test 5] ORDER BY day (Alias)...");
    try {
        const res5 = await adapter.query("SELECT SUBSTRING(c.timestamp, 0, 10) AS day, COUNT(1) as count FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10) ORDER BY day");
        console.log("Success! Found", res5.length, "groups.");
    } catch (e) {
        console.error("Test 5 Failed:", e.message);
    }
}

testGroupByExpr().catch(console.error);
