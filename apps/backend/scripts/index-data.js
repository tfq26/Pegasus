import { db, connectDB } from '../db/surreal.js';
import { RAGService } from '../src/services/ragService.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Custom Data Indexer for RAG
 * 
 * Usage: node scripts/index-data.js <path-to-json> <user-id>
 */

const filePath = process.argv[2];
const userId = process.argv[3];

if (!filePath || !userId) {
    console.error('Usage: node scripts/index-data.js <path-to-json> <user-id>');
    process.exit(1);
}

// Helper to convert a row object to a descriptive sentence for better embedding
function rowToSentence(row) {
    const parts = [];
    if (row.Name) parts.push(`${row.Name}`);
    if (row.Age) parts.push(`is ${row.Age} years old`);
    if (row.Department) parts.push(`works in the ${row.Department} department`);
    if (row.City) parts.push(`based in ${row.City}`);
    if (row.Salary) parts.push(`with a salary of ${row.Salary}`);
    if (row.Status) parts.push(`Status: ${row.Status}`);

    return parts.join(', ') + '.';
}

async function run() {
    try {
        console.log('🔌 Connecting to SurrealDB...');
        await connectDB();

        console.log(`\n📖 Reading data from ${filePath}...`);
        const rawData = readFileSync(join(process.cwd(), filePath), 'utf8');
        const data = JSON.parse(rawData);

        if (!Array.isArray(data)) {
            throw new Error('Data must be an array of objects');
        }

        console.log(`✅ Loaded ${data.length} records.`);

        // 1. Transform rows into descriptive chunks
        console.log('✂️  Chunking data...');
        const chunks = data.map(row => rowToSentence(row));

        // 2. Clear old data from this source to prevent duplication
        const sourceId = `custom_file_${filePath.split('/').pop()}`;
        console.log(`🧹 Clearing old chunks for source: ${sourceId}...`);
        await RAGService.clearSource(sourceId, userId);

        // 3. Index into SurrealDB
        console.log(`🚀 Indexing ${chunks.length} chunks into knowledge base...`);
        await RAGService.indexChunks(chunks, {
            source: `File: ${filePath.split('/').pop()}`,
            source_id: sourceId,
            type: 'custom_data'
        }, userId, 'openai');

        console.log('\n✨ Done! Your data is now indexed and ready for RAG.');
        console.log('You can now ask questions about this data in the chat.');

        process.exit(0);
    } catch (e) {
        console.error('\n❌ Error:', e.message);
        process.exit(1);
    }
}

run();
