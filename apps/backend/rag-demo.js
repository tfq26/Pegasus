import { readFileSync } from 'fs';
import { join } from 'path';

// 1. Manual .env loader MUST run before importing services that use process.env
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
    console.log('✅ Environment variables loaded from .env');
} catch (e) {
    console.warn('⚠️  No .env file found or error reading .env. Using default environment variables.');
}

// 2. Import services after env is populated
const { db, connectDB } = await import('./db/surreal.js');
const { aiClient } = await import('./ai/AIClient.js');

async function runDemo() {
    try {
        console.log('🚀 Starting Pegasus RAG Demo...\n');

        // 3. Check AI Providers
        if (aiClient.providers.size === 0) {
            console.error('❌ Error: No AI providers configured.');
            console.log('Please ensure your .env file contains:');
            console.log('  GEMINI_API_KEY=your_key');
            console.log('  OR');
            console.log('  OPENAI_API_KEY=your_key\n');
            process.exit(1);
        }

        // 4. Connect to SurrealDB
        console.log('[Verify] Connecting to SurrealDB...');
        await connectDB();

        const testUserId = 'demo_user_123';
        const modelId = process.env.OPENAI_API_KEY ? 'openai' : 'gemini';
        console.log(`[Demo] Using AI model: ${modelId}`);

        // 5. Index a "Secret" Fact
        const uniqueFact = "Pegasus v0.9 introduces a feature called 'Quantum Sync' which syncs data across multi-cloud regions in under 50ms.";
        console.log('📝 Indexing unique product fact...');
        console.log(`[Demo] Generating embedding for: "${uniqueFact.substring(0, 50)}..."`);

        let embedding;
        try {
            embedding = await aiClient.generateEmbedding(uniqueFact, modelId);
            console.log(`[Demo] ✅ Embedding generated: ${embedding.length} dimensions`);
        } catch (embErr) {
            console.error('[Demo] ❌ Embedding generation failed:', embErr.message);
            process.exit(1);
        }

        // Insert directly to see actual result
        console.log(`[Demo] Inserting chunk into knowledge_chunk table...`);
        try {
            const insertResult = await db.create('knowledge_chunk', {
                content: uniqueFact,
                embedding: embedding,
                metadata: {
                    source: "Product Roadmap 2026",
                    source_id: "roadmap_v09",
                    type: "internal_doc",
                    indexed_at: new Date().toISOString()
                },
                user: `user:${testUserId}`,
                created_at: new Date().toISOString()
            });
            console.log(`[Demo] ✅ Inserted chunk:`, insertResult);
        } catch (insertErr) {
            console.error('[Demo] ❌ Insert failed:', insertErr.message);
            // Continue anyway to see if existing data can be searched
        }

        // 6. Wait for indexing
        console.log('⏳ Waiting for SurrealDB indexing (2 seconds)...');
        await new Promise(r => setTimeout(r, 2000));

        // 7. Debug: Check what's in the table
        console.log('[Demo] Checking knowledge_chunk table contents...');
        const [allChunks] = await db.query(`SELECT * FROM knowledge_chunk LIMIT 5`);
        console.log(`[Demo] Found ${allChunks?.length || 0} total chunks in table:`);
        if (allChunks && allChunks.length > 0) {
            allChunks.forEach((c, i) => {
                console.log(`  ${i + 1}. user: ${c.user}, source: ${c.metadata?.source}, content: "${c.content?.substring(0, 40)}..."`);
            });
        }

        // 8. Perform a grounded search (simpler query without vector for testing)
        const query = "What is Quantum Sync and how fast is it?";
        console.log(`\n🔍 Searching for: "${query}"`);
        console.log(`[Demo] Query user filter: user:${testUserId}`);

        // Simple text search first
        const [textResults] = await db.query(`
            SELECT * FROM knowledge_chunk 
            WHERE string::lowercase(content) CONTAINS 'quantum'
            LIMIT 5
        `);
        console.log(`[Demo] Text search results (CONTAINS 'quantum'): ${textResults?.length || 0}`);

        // Search matching user
        const [userResults] = await db.query(`
            SELECT * FROM knowledge_chunk 
            WHERE user = $user
            LIMIT 5
        `, { user: `user:${testUserId}` });
        console.log(`[Demo] User-filtered results: ${userResults?.length || 0}`);

        if (textResults && textResults.length > 0) {
            console.log(`✅ Found ${textResults.length} relevant chunks via text search.\n`);

            // 9. Generate a Grounded Answer
            console.log('🤖 Generating grounded answer with citations...');
            const prompt = `
                User Question: ${query}
                Relevant Context:
                ${textResults.map((c, i) => `[Source ${i + 1}]: ${c.content}`).join('\n')}
                
                Answer the user's question using ONLY the context provided. Cite your sources.
            `;

            const llmModelId = process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gemini-2.5-flash';
            console.log(`[Demo] Using LLM model: ${llmModelId}`);
            const response = await aiClient.generateText(prompt, llmModelId);

            console.log('\n--- AI RESPONSE ---');
            console.log(response);
            console.log('-------------------\n');
        } else {
            console.log('❌ No results found even with simple text search.');
            console.log('This means the data did not get inserted properly.');
        }

        // 10. Cleanup
        console.log('🧹 Cleaning up demo data...');
        await db.query(`DELETE knowledge_chunk WHERE metadata.source_id = 'roadmap_v09'`);
        console.log('✨ Demo complete!');

        process.exit(0);
    } catch (e) {
        if (e.message.includes('ECONNREFUSED')) {
            console.error('\n❌ Error: SurrealDB is not running on port 8000.');
            console.log('Please start SurrealDB by running: bun run run-apps.js');
        } else {
            console.error('\n❌ Demo failed:', e.message);
            console.error(e.stack);
        }
        process.exit(1);
    }
}

runDemo();
