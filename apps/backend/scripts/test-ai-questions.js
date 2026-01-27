
import { DataContextService } from '../src/services/DataContextService.js';
import { StorageManager } from '../src/services/storage/StorageManager.js';
import { PromptBuilder } from '../ai/PromptBuilder.js';
import { AIClient } from '../ai/AIClient.js'; // Assuming this exists/is usable
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config'; // Validation check

const TEST_QUESTIONS = [
    { q: "What is the 5-year return of 'SBI Small Cap Fund'?", file: "PortfolioGain-LossReport.xlsx" },
    { q: "What was the closing price of NIFTY 50 on Jan 15th, 2024?", file: "MarketIndices2024.csv" },
    { q: "Compare the 1-year return of 'Axis Midcap Fund' with the NIFTY Midcap 100 index performance.", files: ["PortfolioGain-LossReport.xlsx", "MarketIndices2024.csv"] },
    { q: "Find the worst performing month for my portfolio in 2024 and compare it to the NIFTY 50 performance during that same month.", files: ["PortfolioGain-LossReport.xlsx", "MarketIndices2024.csv"] }
];

const DEMO_DIR = path.resolve(process.cwd(), '../../demo-data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'data/storage/uploads');

// Map generic names to actual filenames found in demo-data
const FILE_MAP = {
    "PortfolioGain-LossReport.xlsx": "PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx",
    "MarketIndices2024.csv": "MarketIndices2024.csv",
    "SectorPerformance2024.csv": "SectorPerformance2024.csv"
};

async function runTests() {
    console.log("Setting up Test Environment...");

    // 1. Simulate Uploads (Copy to uploads dir)
    const userId = "test_user_ai";
    await fs.mkdir(path.join(UPLOADS_DIR), { recursive: true });

    const resourceMap = {}; // filename -> full s3/upload path

    for (const [key, filename] of Object.entries(FILE_MAP)) {
        const src = path.join(DEMO_DIR, filename);
        // Clean target name for friendlier usage, or use raw. Let's use clean name for key in uploads
        // actually standard behavior is uploads/filename.
        // Let's copy to uploads/filename
        const targetFilename = filename;
        const targetKey = `uploads/${targetFilename}`;

        // We need to use provider to upload to "storage" (which might be S3 in dev)
        // Or just copy to local if we want to test "Zero Copy" via resolveDatabasePath logic which handles local too?
        // Wait, Phase 4 was about S3.
        // If I copy to local `data/storage/uploads`, StorageManager (LocalProvider) sees it.
        // But `resolveDatabasePath` only does signed URL if it's S3.
        // If I want to test ZERO COPY S3, I must use S3.
        // `StorageManager` has `upload`.

        try {
            console.log(`Uploading ${filename}...`);
            const content = await fs.readFile(src);
            const provider = await StorageManager.getProvider(userId);
            await provider.upload(targetKey, content);
            resourceMap[key] = targetKey;
        } catch (e) {
            console.error(`Failed to upload ${filename}:`, e.message);
        }
    }

    console.log("Resources ready:", resourceMap);

    // 2. Run Questions
    const aiClient = new AIClient();

    for (const test of TEST_QUESTIONS) {
        console.log(`\n--- Question: "${test.q}" ---`);

        // Construct Resolved Resources
        // We simulate that OneContext found these files
        const resolvedResources = [];
        const filesToInclude = test.files || [test.file];

        for (const f of filesToInclude) {
            if (resourceMap[f]) {
                resolvedResources.push({
                    id: resourceMap[f],
                    type: 'file',
                    title: f,
                    path: resourceMap[f],
                    config: { path: resourceMap[f] } // Adapter needs this!
                });
            }
        }

        // 3. Build Context
        // We use a dummy connectionId because we are strictly testing ad-hoc file functionality here
        // If we provided a connectionId, it would verify DB access.
        // DataContextService allows connectionId to be null/undefined?
        // Let's check logic. It normally requires connectionId OR we can pass `activeTable` or `resolvedResources`.

        try {
            // We pass first file as "active table" context just to bootstrap adapter if needed,
            // or we rely on DataContextService to handle "no main connection, only resources".
            // Looking at DataContextService, if no connectionId, it might default to something or fail.
            // Let's assume we treat the first file as the "primary" connection/file for simplicity of the test wrapper.
            // Actually, DuckDBAdapter can handle `isDataFile`.

            const primaryResource = resolvedResources[0];
            const connectionId = primaryResource.path; // Treat path as ID for file-based

            console.log("Building Context...");
            const contextStart = performance.now();
            const contextData = await DataContextService.buildContext(userId, null, {
                resolvedResources: resolvedResources,
                activeTable: primaryResource.id // hint for main table
            });
            console.log(`Context Built in ${(performance.now() - contextStart).toFixed(2)}ms`);

            // 4. Trace Zero-Copy
            // Check if adapter is using HTTPFS (hacky check of log or property)
            // We can't easily check internal state, but we saw logged output in previous step.

            // 5. Generate Response (Mock or Real)
            // We'll construct the prompt to verify it looks right (has descriptions etc)
            const prompt = PromptBuilder.buildQueryPrompt({
                dialect: contextData.provider,
                schema: contextData.normalizedSchema,
                // Add semantic context if we had it, but for now schema is enough
            }, {
                activeTable: primaryResource.id
            });

            // Brief validation of prompt content
            const promptSnippet = prompt.substring(0, 500);
            console.log("Prompt Context Snippet:", promptSnippet.includes(primaryResource.title) ? "Contains Filename ✅" : "Missing Filename ❌");

            // Optional: Execute Query
            // Since we can't easily parse NL to SQL without the real AI, we will skip the actual AI call unless .env is set.
            if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY) {
                console.log("AI Keys found. Attempting real generation...");
                // This would require more scaffolding (tools definition etc).
                // For this validation, verifying the Context Build is the critical technical part of "System Test".
                // The AI's ability to answer depends on the model.
                // We'll perform a simple SQL query on the adapter to prove data accessibility.

                const adapter = contextData.adapter || contextData.extraAdapters[0];
                if (!adapter) throw new Error("No adapter found in context");

                // Query first 1 row to prove access
                const schema = contextData.normalizedSchema.detailedSchema;
                // Get first table name, handling if schema is empty
                const tableName = Object.keys(schema)[0];
                if (!tableName) {
                    console.warn("Warning: No tables found in detailedSchema. Checking tables list...");
                    // Fallback to searching tables array if detailed is empty (lazy load?)
                    // But analyzeConnection should populate it.
                    console.log("Tables:", contextData.normalizedSchema.tables);
                }

                console.log(`Querying table '${tableName}' to verify access...`);
                // If tableName is still undefined, this will throw, which is good for fail fast
                const result = await adapter.query(`SELECT * FROM "${tableName}" LIMIT 1`);
                console.log("Query Success! Rows:", result.length);
            } else {
                console.log("Skipping AI generation (no keys). Context build verified.");
            }

            // Cleanup adapter for this turn
            if (contextData.adapter) await contextData.adapter.disconnect();
            for (const extra of contextData.extraAdapters) await extra.disconnect();

        } catch (e) {
            console.error("Test Failed:", e);
        }
    }
}

runTests().catch(console.error);
