
import { GeminiProvider } from './ai/providers/GeminiProvider.js';
// import dotenv from 'dotenv';
// dotenv.config();

// Mock config with API key from env
const config = {
    apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
};

if (!config.apiKey) {
    console.error("No API key found in environment variables (GOOGLE_API_KEY or GEMINI_API_KEY)");
    process.exit(1);
}

const provider = new GeminiProvider(config);

async function checkModels() {
    console.log("Checking available models...");
    try {
        const models = await provider.listModels();
        console.log("Available Models:");
        models.forEach(m => console.log(`- ${m.id} (${m.name})`));

        const has25Flash = models.some(m => m.id === 'gemini-2.5-flash');
        if (has25Flash) {
            console.log("\nSUCCESS: gemini-2.5-flash IS available.");
        } else {
            console.log("\nWARNING: gemini-2.5-flash was NOT found in the list.");
        }
    } catch (error) {
        console.error("Failed to list models:", error);
    }
}

checkModels();
