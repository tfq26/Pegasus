import { PostgresAdapter } from '../../apps/backend/adapters/postgresAdapter.js';
import { CosmosAdapter } from '../../apps/backend/adapters/cosmosAdapter.js';

async function testAdapterGuarding() {
    console.log('--- Testing Pillar 7: Centralized Database Adapters ---');

    console.log('\n[1/2] Testing Postgres Adapter Guiding (Mock)...');
    const pgAdapter = new PostgresAdapter({ host: 'localhost', user: 'test' });

    // Mock connect and internal query to avoid real network
    pgAdapter.connect = async () => { };
    pgAdapter.client = {
        query: async () => ({
            command: 'SELECT',
            rows: Array.from({ length: 500 }).map((_, i) => ({ id: i, data: `Row ${i}` }))
        })
    };

    try {
        console.log('Running guarded query (500 rows)...');
        const results = await pgAdapter.query("SELECT * FROM large_table", { maxRows: 100 });
        console.error('❌ ResourceGuard failed to trigger! Returned:', results.length);
    } catch (e) {
        if (e.message.indexOf('Resource limit exceeded') !== -1) {
            console.log('✅ ResourceGuard correctly blocked oversized query:', e.message);
        } else {
            console.error('❌ Unexpected error during guard test:', e.message);
        }
    }

    console.log('\n[2/2] Testing Cosmos Adapter Row Cleaning...');
    const cosmosAdapter = new CosmosAdapter({});
    const mockDoc = {
        id: '123',
        name: 'TestItem',
        _rid: 'rid123',
        _self: 'self123',
        _etag: 'etag123'
    };

    const cleaned = cosmosAdapter.cleanRow(mockDoc);
    if (!cleaned._rid && cleaned.name === 'TestItem') {
        console.log('✅ Cosmos internal fields correctly removed.');
    } else {
        console.error('❌ Cosmos row cleaning failed. Result:', cleaned);
    }

    console.log('\n--- Adapter Centralization Test Complete ---');
}

testAdapterGuarding().catch(console.error);
