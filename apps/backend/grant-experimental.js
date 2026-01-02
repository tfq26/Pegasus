#!/usr/bin/env node
/**
 * Grant Experimental Access Script
 * Usage: node grant-experimental.js <user_id>
 * 
 * This script grants experimental access to a user and optionally enables specific features.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env
try {
    const envPath = join(process.cwd(), '.env');
    const envFile = readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
} catch (e) {
    console.warn('⚠️  No .env file found.');
}

const { db, connectDB } = await import('./db/surreal.js');
const { grantExperimentalAccess, toggleUserFeature, EXPERIMENTAL_FEATURES } = await import('./experimental-features.js');

const userId = process.argv[2];

if (!userId) {
    console.log('Usage: node grant-experimental.js <user_id>');
    console.log('\nTo find your user ID:');
    console.log('  1. Open Pegasus and sign in');
    console.log('  2. Look at the browser console or backend logs for "[Chat] Resolved User ID:"');
    console.log('\nExample:');
    console.log('  node grant-experimental.js 01HQEXAMPLE123');
    process.exit(1);
}

async function run() {
    try {
        console.log('🔌 Connecting to SurrealDB...');
        await connectDB();

        console.log(`\n🔓 Granting experimental access to user: ${userId}`);
        await grantExperimentalAccess(db, userId, 'admin_script');
        console.log('✅ Experimental access granted!');

        // Ask if they want to enable RAG
        console.log('\n📦 Available features:');
        Object.values(EXPERIMENTAL_FEATURES).forEach((f, i) => {
            console.log(`  ${i + 1}. ${f.name} (${f.id})`);
        });

        // Enable RAG by default for testing
        console.log('\n🚀 Enabling RAG Pipeline feature...');
        await toggleUserFeature(db, userId, 'rag-pipeline', true);
        console.log('✅ RAG Pipeline enabled!');

        console.log('\n✨ Done! You can now:');
        console.log('  1. Go to Settings > Experimental tab to see your features');
        console.log('  2. Send a chat message - RAG will now search your knowledge base');

        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    }
}

run();
