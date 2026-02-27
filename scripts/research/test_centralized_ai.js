import { config } from 'dotenv';
import path from 'path';

// Force load the correct .env file
config({ path: path.resolve('apps/backend/.env') });

// Mock SecretService to prevent DB calls during pure logic testing
const { SecretService } = await import('../../apps/backend/src/services/SecretService.js');
SecretService.resolveSecret = async () => null;

const { aiClient } = await import('../../apps/backend/ai/AIClient.js');

async function testCentralizedAI() {
    console.log('--- Testing Pillar 6: Centralized AI Logic ---');

    const userId = 'tfq26';

    // 1. Test Strategy Injection
    console.log('\n[1/3] Testing Strategy Injection...');
    const comparisonIntent = { type: 'comparison', scores: { comparison: 0.9 } };
    const prompt = "Compare sales between today and yesterday.";

    // Test through generateText
    const provider = await aiClient.getProviderForModel('gemini', userId);
    const enriched = provider.enrichPromptWithStrategies(prompt, comparisonIntent);

    if (enriched.includes('[Expert Strategy - Temporal Comparison]')) {
        console.log('✅ Strategy enrichment working correctly.');
    } else {
        console.error('❌ Strategy enrichment failed.');
    }

    // 2. Test Embedding Fallback (Mock)
    console.log('\n[2/3] Testing Embedding Fallbacks...');
    try {
        // We try a model we know might fail or prefix it to trigger logic
        const result = await aiClient.generateEmbedding("Hello world", "invalid-model", { userId });
        console.log('Fallthrough result (expected null if no fallback exists):', result ? 'Success' : 'Null');
    } catch (e) {
        console.log('Caught expected error or fallback triggered:', e.message);
    }

    // 3. Test Batch-to-Sequential logic
    console.log('\n[3/3] Testing Batch-to-Sequential strategy...');
    const multiText = ["Chunk 1", "Chunk 2", "Chunk 3"];
    try {
        const embeddings = await aiClient.generateEmbedding(multiText, "models/text-embedding-004", { userId });
        if (Array.isArray(embeddings) && embeddings.length === 3) {
            console.log('✅ Batch/Sequential embedding successful.');
        } else {
            console.error('❌ Embedding result format unexpected.');
        }
    } catch (e) {
        console.error('❌ Embedding failed:', e.message);
    }

    console.log('\n--- AI Centralization Test Complete ---');
}

testCentralizedAI().catch(console.error);
