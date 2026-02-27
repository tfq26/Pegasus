
import { aiClient } from './apps/backend/ai/AIClient.js';
import { PromptBuilder } from './apps/backend/ai/PromptBuilder.js';

async function verifyResponse() {
    console.log("--- Final Verification: AI Response for CPU Trend ---");

    // 1. Setup Context (Full simulated schema)
    const context = {
        dialect: 'cosmosdb',
        userMessage: 'Show me the average CPU usage trend per day',
        schema: {
            tables: [{
                name: 'OrionMetrics',
                description: 'Performance metrics for technical containers',
                columns: [
                    { name: 'id', type: 'string', description: 'Unique identifier' },
                    { name: 'timestamp', type: 'string', description: 'ISO 8601 timestamp' },
                    { name: 'cpuPercent', type: 'number', description: 'CPU usage percentage' },
                    { name: 'memoryMB', type: 'number', description: 'Memory usage in MB' }
                ]
            }],
            mappings: { tables: {}, columns: {} }
        }
    };

    const settings = {
        model: 'models/gemini-flash-latest',
        temperature: 0
    };

    const systemInstruction = PromptBuilder.buildQueryPrompt(context, settings);
    const userPrompt = context.userMessage;

    console.log("\n[1] Generating SQL Query Step...");
    const result = await aiClient.generateQuery(userPrompt, context, settings);

    if (result.toolCalls) {
        const queryTool = result.toolCalls.find(t => t.function.name === 'query_data');
        if (queryTool) {
            const args = JSON.parse(queryTool.function.arguments);
            console.log("SQL Target:", args.query || args.intent?.query);

            const mockData = [
                { day: '2026-02-01', avg_cpu: 45.5 },
                { day: '2026-02-02', avg_cpu: 52.1 },
                { day: '2026-02-03', avg_cpu: 48.3 },
                { day: '2026-02-04', avg_cpu: 15.8 }, // Drop
                { day: '2026-02-05', avg_cpu: 42.9 }
            ];

            console.log("\n[2] Generating Textual Analysis (Analyst Turnover)...");
            const turnoverPrompt = `
[System Context - Intermediate Query Result]:
${JSON.stringify(mockData, null, 2)}

The user original request was: "Show me the average CPU usage trend per day".
Please summarize this trend in plain clinical text.
`;
            const finalResult = await aiClient.generateContent([
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: null, tool_calls: result.toolCalls },
                { role: 'user', content: turnoverPrompt }
            ], settings);

            console.log("\nFinal AI Text Response:");
            console.log(finalResult.text || finalResult);
        }
    } else {
        console.log("Response:", result.text);
    }
}

verifyResponse().catch(console.error);
