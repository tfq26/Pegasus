import { db, connectDB } from './db/surreal.js';
import { RAGService } from './src/services/ragService.js';
import { aiClient } from './ai/AIClient.js';

async function verifyRAG() {
    try {
        console.log('[Verify] Connecting to SurrealDB...');
        await connectDB();

        const testUserId = 'test_rag_user'; // Mock user
        const modelId = 'openai';

        // 1. Index Mock Data
        console.log('[Verify] Indexing mock data...');
        const mockChunks = [
            "The Pegasus platform supports SurrealDB, MySQL, and MongoDB as primary data sources.",
            "To connect to a MySQL database, you need to provide the host, port, username, and password in the connection settings.",
            "Visualizations in Pegasus can be generated automatically using the 'recommendVisualization' API which analyze query results."
        ];

        await RAGService.indexChunks(mockChunks, {
            source: "Verification Test",
            source_id: "test_verification",
            type: "mock"
        }, testUserId, modelId);

        console.log('[Verify] Indexing complete. Waiting for indices to settle...');
        await new Promise(res => setTimeout(res, 2000));

        // 2. Test Search
        const queries = [
            "What databases does Pegasus support?",
            "How do I connect to MySQL?",
            "How are charts generated?"
        ];

        for (const query of queries) {
            console.log(`\n[Verify] Searching for: "${query}"`);
            const results = await RAGService.hybridSearch(query, testUserId, 3, modelId);

            if (results.length > 0) {
                console.log(`[Verify] Found ${results.length} results:`);
                results.forEach((r, i) => {
                    console.log(`  ${i + 1}. [Score: ${r.score.toFixed(4)}] ${r.content.substring(0, 100)}...`);
                });
            } else {
                console.log('[Verify] No results found.');
            }
        }

        // 3. Cleanup
        console.log('\n[Verify] Cleaning up test data...');
        await RAGService.clearSource("test_verification", testUserId);
        console.log('[Verify] Cleanup complete.');

        process.exit(0);
    } catch (e) {
        console.error('[Verify] Verification failed:', e);
        process.exit(1);
    }
}

verifyRAG();
