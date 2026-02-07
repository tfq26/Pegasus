
import { AIClient } from './apps/backend/ai/AIClient.js';
import { PromptBuilder } from './apps/backend/ai/PromptBuilder.js';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/backend/.env' });

async function runSimulation() {
    const aiClient = new AIClient({
        gemini: {
            apiKey: process.env.GEMINI_API_KEY
        }
    });

    const query_data_tool = {
        name: "query_data",
        description: "Fetch or analyze data from the database using a structured intent.",
        parameters: {
            type: "object",
            properties: {
                resource: { type: "string" },
                filters: { type: "array", items: { type: "object" } },
                groupBy: { type: "array", items: { type: "string" } },
                aggregations: { type: "array", items: { type: "object" } },
                orderBy: { type: "array", items: { type: "object" } },
                limit: { type: "number" }
            },
            required: ["resource"]
        }
    };

    const kusto_query_tool = {
        name: "execute_kql",
        description: "Execute a Kusto Query Language (KQL) query.",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string" }
            },
            required: ["query"]
        }
    };

    const mongo_query_tool = {
        name: "query_mongodb",
        description: "Execute a MongoDB query.",
        parameters: {
            type: "object",
            properties: {
                collection: { type: "string" },
                filter: { type: "object" },
                pipeline: {
                    type: "array",
                    items: { type: "object" } // Added items field
                }
            },
            required: ["collection"]
        }
    };

    const dialects = ['postgres', 'sqlite', 'cosmosdb', 'kusto', 'mongodb'];
    const userMessage = "Show me the average CPU usage trend per day";

    const contextBase = {
        userMessage,
        schema: {
            tables: ['OrionMetrics'],
            detailedSchema: {
                'OrionMetrics': [
                    { name: 'serverId', type: 'string' },
                    { name: 'cpuPercent', type: 'number' },
                    { name: 'timestamp', type: 'string' }
                ]
            }
        }
    };

    const settings = {
        model: 'models/gemini-flash-latest',
        temperature: 0,
        intent: { type: 'visualization' }
    };

    console.log(`\n=== AI DIALECT DICTIONARY SIMULATION ===\n`);

    for (const dialect of dialects) {
        console.log(`\n[DIALECT: ${dialect.toUpperCase()}]`);
        const context = { ...contextBase, dialect };
        const systemPrompt = PromptBuilder.buildQueryPrompt(context, settings);

        // Map dialect to appropriate tool
        let targetTools = [query_data_tool];
        let toolChoice = 'query_data';

        if (dialect === 'kusto') {
            targetTools = [kusto_query_tool];
            toolChoice = 'execute_kql';
        } else if (dialect === 'mongodb') {
            targetTools = [mongo_query_tool];
            toolChoice = 'query_mongodb';
        }

        try {
            const result = await aiClient.generateContent([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ], {
                ...settings,
                tools: targetTools,
                toolChoice: toolChoice
            });

            console.log("\n--- AI Response ---");
            if (result.toolCalls && result.toolCalls.length > 0) {
                console.log("TOOL CALL:", JSON.stringify(result.toolCalls, null, 2));
            } else {
                console.log("TEXT:", result.text || result);
            }
        } catch (e) {
            console.error(`Error for ${dialect}:`, e.message);
        }
    }
}

runSimulation().catch(console.error);
