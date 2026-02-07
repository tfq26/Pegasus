
import { CosmosAdapter } from './apps/backend/adapters/cosmosAdapter.js';

async function testTranslation() {
    const adapter = new CosmosAdapter({
        endpoint: 'test',
        key: 'test',
        database: 'test',
        container: 'OrionMetrics'
    });

    const queries = [
        "SELECT c.status, COUNT(1) as count FROM c GROUP BY c.status",
        "SELECT SUBSTRING(c.timestamp, 0, 10) AS day, AVG(c.cpu_percent) AS avg_cpu FROM c GROUP BY SUBSTRING(c.timestamp, 0, 10) ORDER BY day"
    ];

    console.log("--- Testing SQL Translation ---");
    for (const q of queries) {
        console.log("\nOriginal:", q);
        try {
            // Internal translation logic is private but we can mock enough to test it
            // We'll just call the query method but it will fail on fetchAll, which is fine, we just want to see the console.log of 'translated'
            await adapter.query(q);
        } catch (e) {
            // Expected to fail on connection, but console.log(logMsg) should show the translation
        }
    }
}

testTranslation();
