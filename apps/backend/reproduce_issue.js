
import { CosmosClient } from "@azure/cosmos";
import dotenv from 'dotenv';
dotenv.config();

async function reproduce() {
    console.log('[Test] Reproducing Visualization Query...');

    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;

    if (!endpoint || !key) {
        console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY");
        return;
    }

    const client = new CosmosClient({ endpoint, key });

    // Explicitly targeting what we found
    const targetDbId = 'PegasusLive';
    const targetContainerId = 'OrionMetrics';

    console.log(`\nExecuting Query against ${targetDbId}/${targetContainerId}...`);
    const container = client.database(targetDbId).container(targetContainerId);

    // Query derived from logs
    const query = "SELECT c.status, count(1) as count FROM c GROUP BY c.status";

    try {
        const { resources } = await container.items.query(query).fetchAll();
        console.log("Query Results:", JSON.stringify(resources, null, 2));
    } catch (e) {
        console.error("Query Execution Failed:", e.message);
    }
}

reproduce();
