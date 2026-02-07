
import { aiClient } from '../ai/AIClient.js';
import { spreadsheetToolService } from '../src/services/SpreadsheetToolService.js';
import 'dotenv/config';

async function testVisualizationPrompt() {
    console.log("🧪 Testing Visualization Prompt Logic (Standalone)...");

    // 1. Get Tools (including the newly added generate_visualization)
    const tools = spreadsheetToolService.getReadOnlyTools();

    // Verify tool exists in the list
    const hasVizTool = tools.some(t => t.name === 'generate_visualization');
    if (!hasVizTool) {
        console.error("❌ CRTICAL: generate_visualization tool is NOT in the registry yet!");
        console.error("   (This script might be importing the old version if not saved/reloaded properly, or the edit failed?)");
        // In a standalone run, it should read the file from disk, so it should be there if my previous edit worked.
    } else {
        console.log("✅ generate_visualization tool found in registry.");
    }


    // Mock Schema Context
    const systemInstruction = `You are a data assistant. You have access to a PostgreSQL database with the following table:
    - users (id, name, reputation, created_at)
    
    If asked to visualize, use the 'generate_visualization' tool. You must generate the SQL query yourself based on this schema.`;

    const prompt = "Get the top 5 users by reputation from the users table and create a bar chart.";
    console.log(`\n📤 Sending Prompt: "${prompt}"`);
    console.log(`   Model: gemini-2.0-flash-001`);

    try {
        const response = await aiClient.generateContent([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
        ], {
            model: 'gemini-flash-latest',
            tools: tools,
            toolChoice: 'auto' // Let AI decide, or force it like the backend does for /visualization
        });

        const toolCalls = response.toolCalls || [];
        console.log(`\n📥 AI Response:`);
        console.log(`   Text: ${response.text || '(none)'}`);
        console.log(`   Tool Calls: ${toolCalls.length}`);

        const vizCall = toolCalls.find(tc => tc.function.name === 'generate_visualization');

        if (vizCall) {
            console.log("\n🎉 SUCCESS: AI selected 'generate_visualization'!");
            console.log("   Arguments:", vizCall.function.arguments);
            process.exit(0);
        } else {
            console.error("\n❌ FAILURE: AI did NOT select 'generate_visualization'.");
            console.log("   Selected tools:", toolCalls.map(tc => tc.function.name).join(', '));
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Error:", e);
        process.exit(1);
    }
}

testVisualizationPrompt();
