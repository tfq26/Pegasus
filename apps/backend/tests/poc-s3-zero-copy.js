import duckdb from 'duckdb';
import path from 'path';
import 'dotenv/config'; // Load .env
import { AIClient } from '../ai/AIClient.js';
import { PromptBuilder } from '../ai/PromptBuilder.js';
import { IntentCompiler } from '../src/services/IntentCompiler.js';
import { SchemaTranslator } from '../src/services/SchemaTranslator.js';

console.log("🦆 Starting DuckDB S3 Zero-Copy + AI Query PoC");

// Setup DB
const db = new duckdb.Database(':memory:');
const runQuery = (query) => {
    return new Promise((resolve, reject) => {
        db.all(query, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
};

const aiClient = new AIClient();

async function main() {
    try {
        console.log("📦 Loading httpfs extension...");
        await runQuery("INSTALL httpfs; LOAD httpfs;");
        console.log("✅ httpfs extension loaded!");

        // 1. Setup Data Sources (Simulated Registry)
        const demoDataPath = path.resolve(process.cwd(), '../../demo-data/MarketIndices2024.csv');
        const remoteUrl = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv";

        console.log("📂 Registering Views...");

        // Register Local Demo View
        await runQuery(`
            CREATE OR REPLACE VIEW market_indices AS 
            SELECT * FROM read_csv_auto('${demoDataPath.replace(/\\/g, '/')}');
        `);

        // Register Remote View
        await runQuery(`
            CREATE OR REPLACE VIEW titanic AS 
            SELECT * FROM read_csv_auto('${remoteUrl}');
        `);

        // 2. Build Schema Context for AI
        // In a real app, this comes from ConnectionAnalyzer/SemanticRegistry
        const schemaContext = {
            tables: ['market_indices', 'titanic'],
            detailedSchema: {
                'market_indices': [
                    { name: 'Date', type: 'VARCHAR' },
                    { name: 'NIFTY 50', type: 'DOUBLE' },
                    { name: 'SENSEX', type: 'DOUBLE' }
                ],
                'titanic': [
                    { name: 'PassengerId', type: 'INTEGER' },
                    { name: 'Survived', type: 'INTEGER' },
                    { name: 'Pclass', type: 'INTEGER' },
                    { name: 'Name', type: 'VARCHAR' },
                    { name: 'Sex', type: 'VARCHAR' },
                    { name: 'Age', type: 'DOUBLE' },
                    { name: 'Fare', type: 'DOUBLE' }
                ]
            }
        };

        // 3. Test Questions from testQuestions.md
        const questions = [
            "What was the closing price of NIFTY 50 on Jan 15th, 2024?", // Local
            "What is the average age of survivors by passenger class?", // Remote
            "Plot the trend of NIFTY 50 vs SENSEX from the Market Indices file." // Visual
        ];

        for (const question of questions) {
            console.log(`\n❓ Question: "${question}"`);

            // A. Generate Intent (AI)
            const prompt = PromptBuilder.buildQueryPrompt({
                dialect: 'duckdb',
                schema: schemaContext
            }, {
                aiDetail: 0,
                customInstructions: "Analyze the question and break it down into logical data retrieval steps. Return a valid JSON intent array."
            });

            const intentJson = await aiClient.generateQuery(question, {
                systemPrompt: prompt,
                schema: schemaContext
            });

            console.log("🧠 Intent:", JSON.stringify(intentJson, null, 2));

            // B. Compile to SQL (IntentCompiler)
            // Mocking the 'adapter' interface for IntentCompiler just to get dialect 'duckdb'
            const metric = intentJson.visualization ? 'visualization' : 'data';

            if (intentJson.visualization) {
                console.log("📊 Visualization Requested:", intentJson.visualization);
                // For viz, we usually fetch data first. Let's assume the compiler handles the data part.
                // In this PoC we just run the data query part of the intent.
            }

            // We need to compile the 'data' part of the intent (intentJson itself is the array of ops or single op)
            const intents = Array.isArray(intentJson) ? intentJson : [intentJson];

            for (const intent of intents) {
                if (!intent.resource) continue;

                // Compile SQL
                const sql = IntentCompiler.compile(intent, 'duckdb');
                console.log(`💻 Generated SQL: ${sql}`);

                // Execute Zero-Copy Query
                const startTime = performance.now();
                const result = await runQuery(sql);
                const endTime = performance.now();

                console.log(`⏱️ Execution Time: ${(endTime - startTime).toFixed(2)}ms`);
                console.log(`✅ Result (${result.length} rows):`);
                if (result.length > 0) console.table(result.slice(0, 5));
            }
        }

        console.log("\n✅ NL-to-SQL Zero-Copy Verification Passed!");

    } catch (e) {
        console.error("❌ PoC Failed:", e);
        process.exit(1);
    }
}

main();
