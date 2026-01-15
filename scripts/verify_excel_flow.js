
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3333';
const EXCEL_FILE_PATH = path.resolve('/Users/taufeeqali/Projects/Pegasus/Pegasus-Application/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx');

async function runTest() {
    console.log('🚀 Starting Excel Persistence Flow Test...');

    // 1. Authenticate (using /auth/me dev bypass)
    console.log('--- Step 1: Authenticating ---');
    const authRes = await fetch(`${BACKEND_URL}/auth/me`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    const authData = await authRes.json();
    const token = authData.token;
    if (!token) {
        console.error('❌ Authentication failed', authData);
        process.exit(1);
    }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    console.log('✅ Authenticated');

    // 2. Upload Excel File
    console.log('--- Step 2: Uploading Excel File ---');
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(EXCEL_FILE_PATH);
    const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    formData.append('file', blob, path.basename(EXCEL_FILE_PATH));

    const uploadRes = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData
    });

    const uploadData = await uploadRes.json();
    if (!uploadData.success) {
        console.error('❌ Upload failed', uploadData);
        process.exit(1);
    }

    const testTableId = uploadData.tables[0];
    const uploadId = uploadData.uploadId;
    console.log(`✅ Upload successful. Table: ${testTableId}, UploadId: ${uploadId}`);

    // 3. Verify Initial Data
    console.log('--- Step 3: Verifying Initial Data ---');
    const queryRes1 = await fetch(`${BACKEND_URL}/api/table/${testTableId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: { uploadId },
            limit: 1000 // Fetch all rows
        })
    });
    const data1 = await queryRes1.json();
    console.log(`✅ Retrieved ${data1.rows.length} rows.`);

    // Extract and print Fund Names
    const fundNames = data1.rows.map(row => row['Fund Name']).filter(Boolean);
    console.log('\n--- Fund Names Report ---');
    console.log(`Total Fund Names found: ${fundNames.length}`);
    fundNames.forEach((name, i) => console.log(`${i + 1}. ${name}`));

    const uniqueFunds = [...new Set(fundNames)];
    console.log(`Unique Fund Count: ${uniqueFunds.length}`);
    console.log('-------------------------\n');

    const originalRows = [...data1.rows];

    // 4. Simulate "Save" (Full Replacement)
    console.log('--- Step 4: Testing "Save" (Full Replacement) ---');
    // Modify the first row's score or a similar field if it exists, or just add a new field
    // Let's see what the columns are
    const firstRow = originalRows[0];
    const firstCol = Object.keys(firstRow).find(k => k !== 'id' && k !== '__id' && k !== '_row_order');
    console.log(`Modifying column "${firstCol}" in first row...`);

    const modifiedRows = originalRows.map((row, idx) => {
        if (idx === 0) {
            return { ...row, [firstCol]: 'MODIFIED_BY_SAVE' };
        }
        return row;
    });

    const saveRes = await fetch(`${BACKEND_URL}/api/table/${testTableId}/operations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: { uploadId },
            operations: [
                {
                    type: 'full_replacement',
                    rows: modifiedRows
                }
            ]
        })
    });

    if (!saveRes.ok) {
        console.error('❌ Save failed', await saveRes.text());
        process.exit(1);
    }
    console.log('✅ Save successful');

    // Verify Save
    const queryRes2 = await fetch(`${BACKEND_URL}/api/table/${testTableId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: { uploadId },
            limit: 10
        })
    });
    const data2 = await queryRes2.json();
    if (data2.rows[0][firstCol] === 'MODIFIED_BY_SAVE') {
        console.log('✅ Verification: Data correctly updated via Save (Full Replacement)');
    } else {
        console.error('❌ Verification FAILED: Data not updated. Found:', data2.rows[0][firstCol]);
        process.exit(1);
    }

    // 5. Simulate "Commit" (Delta/Update)
    console.log('--- Step 5: Testing "Commit" (Delta Operations) ---');
    const targetRow = data2.rows[0];
    console.log('Target row data:', JSON.stringify(targetRow, null, 2));
    const targetId = targetRow.id || `${testTableId}:${targetRow.__id}`;
    console.log(`Targeting ID for update: ${targetId}`);

    const commitRes = await fetch(`${BACKEND_URL}/api/table/${testTableId}/operations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: { uploadId },
            operations: [
                {
                    type: 'update',
                    id: targetId,
                    changes: { [firstCol]: 'COMMITTED_VALUE' }
                }
            ]
        })
    });

    if (!commitRes.ok) {
        console.error('❌ Commit failed', await commitRes.text());
        process.exit(1);
    }
    console.log('✅ Commit successful');

    // Final Verification
    const queryRes3 = await fetch(`${BACKEND_URL}/api/table/${testTableId}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            provider: 'surrealdb',
            connection: { uploadId },
            limit: 10
        })
    });
    const data3 = await queryRes3.json();
    if (data3.rows[0][firstCol] === 'COMMITTED_VALUE') {
        console.log('✅ Final Verification: Data correctly updated via Commit (Deltas)');
    } else {
        console.error('❌ Final Verification FAILED: Found:', data3.rows[0][firstCol]);
        process.exit(1);
    }

    console.log('\n✨ Excel Persistence Flow PASSED! ✨');
}

runTest().catch(console.error);
