
import { CosmosAdapter } from './apps/backend/adapters/cosmosAdapter.js';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/backend/.env' });

async function debugData() {
    const adapter = new CosmosAdapter({
        endpoint: process.env.COSMOS_ENDPOINT,
        key: process.env.COSMOS_KEY,
        database: process.env.COSMOS_DATABASE,
        container: 'OrionMetrics'
    });

    console.log("Connecting to Cosmos...");
    await adapter.connect();

    console.log("Sampling 1 document...");
    const data = await adapter.sampleCollection('OrionMetrics', 1);
    console.log("Sample Document:", JSON.stringify(data[0], null, 2));

    if (data[0]) {
        console.log("timestamp type:", typeof data[0].timestamp);
        console.log("cpuPercent type:", typeof data[0].cpuPercent);
    }
}

debugData().catch(console.error);
