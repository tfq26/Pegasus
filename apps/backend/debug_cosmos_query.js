
import { CosmosAdapter } from './adapters/cosmosAdapter.js';
import dotenv from 'dotenv';
dotenv.config();

async function debugCosmosQuery() {
    console.log('[Debug] Starting Cosmos Query Debugger...');

    const adapter = new CosmosAdapter({
        endpoint: process.env.COSMOS_ENDPOINT,
        key: process.env.COSMOS_KEY,
        database: 'PegasusLive',
        container: 'OrionMetrics'
    });

    try {
        await adapter.connect();

        // The problematic query from logs
        // Note: The logs showed "SELECT status, COUNT(1)..." which implies missing aliases
        const rawQuery = 'SELECT status, COUNT(*) as count FROM c GROUP BY status';

        console.log(`[Debug] Testing Query: "${rawQuery}"`);
        const results = await adapter.query(rawQuery);
        console.log('[Debug] Results:', JSON.stringify(results, null, 2));

    } catch (e) {
        console.error('[Debug] Query Failed:', e.message);
        console.error('[Debug] ActivityId:', e.activityId);
    } finally {
        await adapter.disconnect();
    }
}

debugCosmosQuery();
