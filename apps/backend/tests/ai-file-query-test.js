process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://u:p@localhost:5432/db";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTest(prompt, filesToInclude = []) {
    const { aiClient } = await import('../ai/AIClient.js');
    const { adapters } = await import('../adapters/index.js');
    const { ConnectionAnalyzer } = await import('../src/services/ConnectionAnalyzer.js');
    const { spreadsheetToolService } = await import('../src/services/SpreadsheetToolService.js');
    const { PromptBuilder } = await import('../ai/PromptBuilder.js');

    console.log(`\n🚀 Testing Prompt: "${prompt}"`);

    const normalizedSchema = { tables: [], detailedSchema: {}, mappings: { tables: {}, columns: {} } };
    const resourceToAdapter = {};
    const resourceToProvider = {};
    const extraAdapters = [];

    const unifiedDuckDB = new adapters.duckdb({ path: ':memory:' });
    await unifiedDuckDB.connect();
    extraAdapters.push(unifiedDuckDB);

    try {
        const demoDataDir = path.join(__dirname, '../../../demo-data');
        const availableFiles = fs.readdirSync(demoDataDir);

        for (const file of availableFiles) {
            const fullPath = path.join(demoDataDir, file);
            const ext = path.extname(file).toLowerCase();
            const baseName = file.split('.')[0];
            const isRequested = filesToInclude.some(f => file.includes(f));

            if (isRequested || filesToInclude.length === 0) {
                let adapter = unifiedDuckDB;
                let provider = 'duckdb';

                if (ext === '.csv' || ext === '.xlsx' || ext === '.parquet') {
                    await unifiedDuckDB.registerTable(baseName, fullPath);
                } else if (ext === '.db' || ext === '.sqlite') {
                    adapter = new adapters.sqlite({ path: fullPath });
                    await adapter.connect();
                    extraAdapters.push(adapter);
                    provider = 'sqlite';
                } else continue;

                const analysis = await ConnectionAnalyzer.analyze(adapter, provider);
                normalizedSchema.tables.push(...analysis.normalizedSchema.tables);
                Object.assign(normalizedSchema.detailedSchema, analysis.normalizedSchema.detailedSchema);
                Object.assign(normalizedSchema.mappings.tables, analysis.normalizedSchema.mappings.tables);
                Object.assign(normalizedSchema.mappings.columns, analysis.normalizedSchema.mappings.columns);

                analysis.normalizedSchema.tables.forEach(t => {
                    resourceToAdapter[t] = adapter;
                    resourceToProvider[t] = provider;
                });
            }
        }

        // De-duplicate tables list
        normalizedSchema.tables = [...new Set(normalizedSchema.tables)];

        console.log(`[Test] Unified schema ready. Tables: ${normalizedSchema.tables.join(', ')}`);

        // Find active table from prompt
        const activeTable = normalizedSchema.tables.find(t =>
            prompt.toLowerCase().includes(t.toLowerCase()) ||
            prompt.toLowerCase().includes(t.replace(/[^a-z0-9]/g, '').toLowerCase())
        ) || normalizedSchema.tables[0];

        const aiSettings = {
            modelId: 'gemini-2.0-flash',
            temperature: 0,
            tools: spreadsheetToolService.getReadOnlyTools(),
            activeTable,
            customInstructions: "If a user asks about their 'portfolio' and you see a 'PortfolioGain-LossReport' or 'transactions' table, use those. DO NOT return 'ambiguous': true if you can make a reasonable guess. Use LIKE/contains for string matching."
        };

        // ENHANCEMENT: Start with a context-rich prompt
        let currentPrompt = `I have the following tables: ${normalizedSchema.tables.join(', ')}.\n\nUser Question: ${prompt}`;

        for (let i = 1; i <= 3; i++) {
            console.log(`\n--- AI Iteration ${i} ---`);
            const result = await aiClient.generateQuery(currentPrompt, { dialect: 'duckdb', schema: normalizedSchema }, aiSettings);

            let text = typeof result === 'string' ? result : (result.text || "");
            let cleanedText = PromptBuilder.cleanResponse(text, 'duckdb');
            if (cleanedText.startsWith('json')) cleanedText = cleanedText.replace(/^json\s+/, '').trim();
            console.log(`[AI] Raw Cleaned: ${cleanedText}`);

            if (!result.toolCalls?.length && (cleanedText.startsWith('{') || cleanedText.startsWith('['))) {
                try {
                    const parsed = JSON.parse(cleanedText);
                    const firstIntent = Array.isArray(parsed) ? parsed[0] : parsed;
                    if (firstIntent.resource || firstIntent.ambiguous) {
                        result.toolCalls = [{
                            function: {
                                name: firstIntent.resource ? 'query_data' : 'none',
                                arguments: JSON.stringify(parsed)
                            }
                        }];
                    }
                } catch (e) { }
            }

            if (!result.toolCalls?.length) {
                const cleaned = PromptBuilder.cleanResponse(text, 'duckdb');
                if (cleaned.startsWith('{')) {
                    console.log(`[AI] Response (JSON): ${cleaned}`);
                } else {
                    console.log(`[AI] Response: ${text}`);
                }
                break;
            }

            console.log(`[AI] Called:`, result.toolCalls.map(t => t.function.name));

            const dataTool = result.toolCalls.find(t => t.function.name === 'query_data');
            if (dataTool) {
                const intents = JSON.parse(dataTool.function.arguments);
                const isArray = Array.isArray(intents);
                const firstIntent = isArray ? intents[0] : intents;

                // Route to the correct adapter for the first resource
                const targetAdapter = resourceToAdapter[firstIntent.resource] || unifiedDuckDB;
                const targetProvider = resourceToProvider[firstIntent.resource] || 'duckdb';

                try {
                    const toolResult = await spreadsheetToolService.callTool('query_data', intents, {
                        adapter: targetAdapter, dialect: targetProvider, schema: normalizedSchema
                    });
                    console.log(`\n✅ Query Succeeded!`);

                    const bigIntReplacer = (key, value) => typeof value === 'bigint' ? value.toString() : value;
                    const jsonSafeData = JSON.parse(JSON.stringify(toolResult, bigIntReplacer));

                    const answerRes = await aiClient.generateContent([{
                        role: 'user',
                        content: prompt + '\nAnalytical Results:\n' + JSON.stringify(jsonSafeData, null, 2)
                    }]);
                    console.log(`\n💡 AI Explanation: ${answerRes.text}`);
                    break;
                } catch (e) {
                    console.log(`[Test] Tool failed: ${e.message}`);
                    currentPrompt += `\n\n[System Error]: ${e.message}. \nNote: You must use the actual table names from the schema. Available tables: ${normalizedSchema.tables.join(', ')}`;
                    continue;
                }
            }
            break;
        }
    } finally {
        for (const a of extraAdapters) await a.disconnect().catch(() => { });
    }
}

const userPrompt = process.argv[2] || "Top 3 sectors by return in Sector Performance";
const includedFiles = process.argv.slice(3);

/**
 * AI File Query Test Utility
 * Usage: node tests/ai-file-query-test.js "Your Question" [Optional File Filters...]
 */
runTest(userPrompt, includedFiles);
