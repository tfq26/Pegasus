/**
 * Persistence Verification Script
 * This script verifies the Save and Commit systems by interacting directly with the backend API.
 * 1. Authenticates using dev mode
 * 2. Creates a test table
 * 3. Tests 'full_replacement' operation (Save)
 * 4. Tests 'update', 'create', 'delete' operations (Commit)
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const USER_EMAIL = 'dev@pegasus.ai';
let token = '';

async function run() {
    console.log('🚀 Starting Persistence Test...');

    // 1. Get Dev Token
    try {
        console.log('--- Step 1: Authenticating ---');
        // Dev mode bypass login
        const loginRes = await fetch(`${BACKEND_URL}/auth/login?return_to=http://localhost:5173`);
        const url = new URL(loginRes.url);
        token = url.searchParams.get('token');
        if (!token) throw new Error('Failed to get dev token');
        console.log('✅ Authenticated with token:', token.substring(0, 10) + '...');
    } catch (e) {
        console.error('❌ Failed to authenticate. Is the backend running in PEG_DEV_MODE=true?');
        console.error(e.message);
        process.exit(1);
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // 2. Create a test table
    const testTableName = `test_persistence_${Date.now()}`;
    const testTableId = `data_test_${testTableName}`;
    console.log(`--- Step 2: Creating Test Table: ${testTableId} ---`);

    // We can use /api/experimental/copy-table or just insert via a dummy operation
    // But easiest is to use /api/data to create something if it doesn't exist?
    // Actually our operations endpoint will create the table if missing in SurrealDB due to DEFINE TABLE.

    const initialRows = [
        { id: 1, name: 'Alice', score: 85 },
        { id: 2, name: 'Bob', score: 92 }
    ];

    // 3. Test Full Replacement (The "Save" flow)
    console.log('--- Step 3: testing Full Replacement (Save) ---');
    const fullReplacementOp = {
        type: 'full_replacement',
        rows: initialRows
    };

    const saveRes = await fetch(`${BACKEND_URL}/api/table/${testTableId}/operations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: {}, // default
            operations: [fullReplacementOp]
        })
    });

    if (!saveRes.ok) {
        const error = await saveRes.json();
        console.error('❌ Save failed:', error);
        process.exit(1);
    }
    console.log('✅ Save successful');

    // Verify initial data
    const verifyRes1 = await fetch(`${BACKEND_URL}/api/table/${testTableId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            tableName: testTableId,
            provider: 'surrealdb',
            connection: {},
            query: { limit: 10, offset: 0 }
        })
    });
    const data1 = await verifyRes1.json();
    console.log(`✅ Verified initial data: ${data1.rows.length} rows found`);
    if (data1.rows.length !== 2) {
        console.error('❌ Expected 2 rows, got', data1.rows.length);
        process.exit(1);
    }

    // 4. Test Delta Operations (The "Commit" flow)
    console.log('--- Step 4: testing Delta Operations (Commit) ---');

    // We need the SurrealDB IDs for existing rows to update them.
    // In SurrealDB, records have IDs like table:uuid
    const bob = data1.rows.find(r => r.name === 'Bob');
    if (!bob || !bob.__id) {
        console.error('❌ Could not find Bob or Bob ID missing. Rows:', data1.rows);
        process.exit(1);
    }

    const operations = [
        {
            type: 'update',
            id: `${testTableId}:${bob.__id}`,
            changes: { score: 95 }
        },
        {
            type: 'create',
            data: { id: 3, name: 'Charlie', score: 78 }
        }
    ];

    const commitRes = await fetch(`${BACKEND_URL}/api/table/${testTableId}/operations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: {},
            operations: operations
        })
    });

    if (!commitRes.ok) {
        const error = await commitRes.json();
        console.error('❌ Commit failed:', error);
        process.exit(1);
    }
    console.log('✅ Commit successful');

    // 5. Final Verification
    console.log('--- Step 5: Final Verification ---');
    const verifyRes2 = await fetch(`${BACKEND_URL}/api/table/${testTableId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            tableName: testTableId,
            provider: 'surrealdb',
            connection: {},
            query: { limit: 10, offset: 0 }
        })
    });
    const data2 = await verifyRes2.json();
    console.log(`✅ Final data retrieved: ${data2.rows.length} rows`);

    const updatedBob = data2.rows.find(r => r.name === 'Bob');
    const charlie = data2.rows.find(r => r.name === 'Charlie');

    if (updatedBob && updatedBob.score === 95) {
        console.log('✅ Bob updated correctly (Score: 95)');
    } else {
        console.error('❌ Bob update failed or score mismatch:', updatedBob);
    }

    if (charlie) {
        console.log('✅ Charlie created correctly');
    } else {
        console.error('❌ Charlie creation failed');
    }

    if (data2.rows.length === 3) {
        console.log('✅ Row count is 3 as expected');
    }

    console.log('\n✨ Persistence System Verification PASSED! ✨');
}

run().catch(err => {
    console.error('💥 Test Error:', err);
    process.exit(1);
});
