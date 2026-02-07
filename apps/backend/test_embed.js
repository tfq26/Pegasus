
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

async function testEmbed() {
    console.log('[Test] Testing Gemini Embeddings...');
    const genAI = new GoogleGenerativeAI(process.env.PEGASUS_AI_API_KEY || process.env.GOOGLE_API_KEY);

    const modelsToTry = [
        "text-embedding-004",
        "models/text-embedding-004",
        "embedding-001",
        "models/embedding-001"
    ];

    for (const modelId of modelsToTry) {
        console.log(`\nTesting model: ${modelId}`);
        try {
            const model = genAI.getGenerativeModel({ model: modelId });
            const result = await model.embedContent("Hello world");
            console.log(`[SUCCESS] ${modelId} worked! Vector length: ${result.embedding.values.length}`);
            return; // Exit on first success
        } catch (e) {
            console.error(`[FAILED] ${modelId}: ${e.message}`);
        }
    }
}

testEmbed();
