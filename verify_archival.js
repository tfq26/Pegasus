import { config } from 'dotenv';
config({ path: 'apps/backend/.env' });

async function verifyArchival() {
    // Dynamic imports to ensure env vars are loaded first
    const { runQueryArchival } = await import('./apps/backend/src/jobs/archiveQueries.js');
    const { runChatArchival } = await import('./apps/backend/src/jobs/archiveChats.js');
    const { db } = await import('./apps/backend/src/db/index.js');

    console.log('--- Starting Archival Verification ---');

    console.log('\n1. Testing Query Archival...');
    await runQueryArchival();

    console.log('\n2. Testing Chat Archival...');
    await runChatArchival();

    console.log('\n--- Verification Complete ---');
    process.exit(0);
}

verifyArchival();
