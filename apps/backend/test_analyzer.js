
import { VisualizationAnalyzer } from './ai/VisualizationAnalyzer.js';
import dotenv from 'dotenv';
dotenv.config();

// Mock AI Client to avoid making real calls if analyzer uses it
// Actually VisualizationAnalyzer uses aiClient.generateContent.
// We'll rely on the real one since we updated providers.

async function testAnalyzer() {
    console.log('[Test] Testing VisualizationAnalyzer with single-item data...');

    const prompt = "What is the distribution of server statuses in a pie chart?";
    const data = [{ status: 'online', count: 6675 }];
    const activeModel = 'gemini-2.0-flash'; // Use a fast one
    const userId = 'user_test';
    const forceVisualization = true;

    try {
        const result = await VisualizationAnalyzer.analyze(prompt, data, activeModel, userId, forceVisualization);
        console.log("Analyzer Result:", JSON.stringify(result, null, 2));

        if (result.shouldVisualize && result.blueprint) {
            console.log("✅ Visualization Blueprint Generated");
        } else {
            console.error("❌ Failed to generate blueprint");
        }
    } catch (e) {
        console.error("Analyzer Failed:", e);
    }
}

testAnalyzer();
