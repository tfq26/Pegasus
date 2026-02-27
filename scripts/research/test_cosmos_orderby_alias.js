
import { CosmosAdapter } from './apps/backend/adapters/cosmosAdapter.js';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/backend/.env' });

async function testOrderByAlias() {
    const adapter = new CosmosAdapter({
        endpoint: process.env.COSMOS_ENDPOINT,
        key: process.env.COSMOS_KEY,
        database: process.env.COSMOS_DATABASE,
        container: 'OrionMetrics'
    });

    await adapter.connect();

    // Test: ORDER BY alias directly (no c. prefix)
    console.log("\n[Test] SELECT ... AS day ... ORDER BY day");
    // We bypass the adapter's translation by calling the container directly for this test
    const query = "SELECT SUBSTRING(c.timestamp, 0, 10) AS day, COUNT(1) as count FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10) ORDER BY day";
    try {
        const { resources } = await adapter.container.items.query(query).fetchAll();
        console.log("Success! Found", resources.length, "groups sorted by day.");
        console.log("Sample:", resources[0]);
    } catch (e) {
        console.error("Test Failed:", e.message);
    }
}

testOrderByAlias().catch(console.error);
