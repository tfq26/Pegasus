
import { CosmosAdapter } from '../apps/backend/adapters/cosmosAdapter.js';

const adapter = new CosmosAdapter({
    endpoint: 'https://placeholder:443/',
    key: 'placeholder',
    database: 'PegasusLive',
    container: 'OrionMetrics'
});

const query = `SELECT serverType, COUNT(*) as count
FROM OrionMetrics
WHERE status = 'online'
GROUP BY serverType`;

// Mock connect to avoids actual network calls
adapter.connect = async () => {
    adapter.client = { database: () => ({ container: () => ({ items: { query: (q) => ({ fetchAll: async () => ({ resources: [] }) }) } }) }) };
    adapter.database = adapter.client.database();
    adapter.container = adapter.database.container();
};

async function test() {
    await adapter.connect();
    console.log("Original Query:\n", query);

    // We catch the translated query by overriding the fetchAll call
    let capturedQuery = "";
    adapter.container.items.query = (q) => {
        capturedQuery = q;
        return { fetchAll: async () => ({ resources: [] }) };
    };

    try {
        await adapter.query(query);
        console.log("\nTranslated Query:\n", capturedQuery);
    } catch (e) {
        console.error("Error during query translation:", e);
    }
}

test();
