
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('apps/backend/.env') });

async function simulateFinalResponse() {
    console.log("🚀 SIMULATING FINAL AI RESPONSE...");

    // Dynamic imports after env is loaded
    const { DataContextService } = await import('../src/services/DataContextService.js');
    const { PromptBuilder } = await import('../ai/PromptBuilder.js');
    const { aiClient } = await import('../ai/AIClient.js');

    const userId = "test-user";
    const userMessage = "List any servers that are currently 'online' but have a CPU usage over 80% or an Error Message that isn't null. @[TerminalName: bun.exe, ProcessId: 82257]";

    console.log("\n1. Building Real Context (Mocking DB URL for stability)...");
    process.env.DATABASE_URL = "postgresql://fake:fake@fake/fake";
    const context = await DataContextService.buildContext(userId, 'connection:local', {});

    // Inject mock data insight if registry fails in test env
    if (!context.normalizedSchema.sourceRegistry['OrionMetrics']) {
        console.warn("⚠️ OrionMetrics not detected in environment, forcing schema for simulation.");
        context.normalizedSchema.tables.push('OrionMetrics');
        context.normalizedSchema.sourceRegistry['OrionMetrics'] = { provider: 'cosmosdb', origin: 'System Metrics' };
        context.normalizedSchema.detailedSchema['OrionMetrics'] = [
            { name: 'serverId', type: 'string' },
            { name: 'serverName', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'cpuPercent', type: 'number' },
            { name: 'errorMessage', type: 'string' },
            { name: 'timestamp', type: 'string' }
        ];
    }

    console.log("\n2. Building Prompt...");
    const systemPrompt = PromptBuilder.buildQueryPrompt({
        dialect: 'cosmosdb',
        schema: context.normalizedSchema,
        userMessage: userMessage
    });

    console.log("\n3. Calling AI (Simulation)...");
    try {
        const response = await aiClient.generateContent([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
        ], { model: 'gemini-3-flash-preview' });

        console.log("\n--- AI RESPONSE START ---");
        console.log(response.text);
        console.log("--- AI RESPONSE END ---");

        const hasTerminalHallucination = response.text.includes("bun.exe") || response.text.includes("82257");
        const hasCorrectQuery = response.text.includes("SELECT") && (response.text.includes("OrionMetrics") || response.text.includes(" FROM c")) && !response.text.includes("|");

        if (!hasTerminalHallucination && hasCorrectQuery) {
            console.log("\n✅ SUCCESS: AI generated a valid Cosmos SQL query and ignored terminal metadata!");
        } else {
            if (hasTerminalHallucination) console.error("\n❌ FAILURE: AI hallucinated terminal data.");
            if (!hasCorrectQuery) console.error("\n❌ FAILURE: AI failed to generate correct Cosmos SQL syntax.");
        }

    } catch (e) {
        console.error("\n❌ AI Call Failed:", e.message);
    }

    console.log("\n🚀 SIMULATION COMPLETE.");
    process.exit(0);
}

simulateFinalResponse();
