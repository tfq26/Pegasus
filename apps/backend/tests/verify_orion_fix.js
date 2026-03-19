
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('apps/backend/.env') });

async function verifyFixedMetrics() {
    console.log("🚀 VERIFYING FIXED METRICS RESPONSE...");

    const { DataContextService } = await import('../src/services/DataContextService.js');
    const { PromptBuilder } = await import('../ai/PromptBuilder.js');
    const { aiClient } = await import('../ai/AIClient.js');

    const userId = "test-user";
    const userMessage = "how are the app servers doing right now? are there any issues?";

    console.log("\n1. Building Context...");
    // Mock current time to March 9, 2026
    const settings = {
        currentTime: "2026-03-09T22:10:48-05:00",
        aiDetail: 'high'
    };

    // We don't need a real DB for prompt generation testing
    process.env.DATABASE_URL = "postgresql://fake:fake@fake/fake";
    const context = await DataContextService.buildContext(userId, 'connection:local', { userMessage });

    // Ensure OrionMetrics is available for simulation
    if (!context.normalizedSchema.sourceRegistry['OrionMetrics']) {
        context.normalizedSchema.tables.push('OrionMetrics');
        context.normalizedSchema.sourceRegistry['OrionMetrics'] = { provider: 'cosmosdb', origin: 'System Metrics' };
        context.normalizedSchema.detailedSchema['OrionMetrics'] = [
            { name: 'serverId', type: 'string' },
            { name: 'serverName', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'cpuPercent', type: 'number' },
            { name: 'latencyMs', type: 'number' },
            { name: 'errorMessage', type: 'string' },
            { name: 'timestamp', type: 'string' }
        ];
    }

    console.log("\n2. Building System Prompt...");
    const systemPrompt = PromptBuilder.buildQueryPrompt({
        dialect: 'cosmosdb',
        schema: context.normalizedSchema,
        userMessage: userMessage
    }, settings);

    console.log("\n3. Verifying Prompt Grounding Rules...");
    const hasLiveDataPriority = systemPrompt.includes("ALWAYS prioritize live data fetched via `query_data` over information found in the Knowledge Base");
    const hasOrionHealthCheck = systemPrompt.includes("Orion Metrics Health Check");
    const hasTemporalGrounding = systemPrompt.includes("Use the provided \"Current Time\" as the 0-point");
    const hasLagResilience = systemPrompt.includes("Resilience to Lag (CRITICAL)");
    const hasVisualGrounding = systemPrompt.includes("Visual Intent Grounding") && systemPrompt.includes("sorted by `timestamp ASC`.");
    const hasDataIntegrity = systemPrompt.includes("Data Integrity") && systemPrompt.includes("NEVER return placeholder strings like '-'");

    if (hasLiveDataPriority && hasOrionHealthCheck && hasTemporalGrounding && hasLagResilience && hasVisualGrounding && hasDataIntegrity) {
        console.log("✅ SUCCESS: System prompt contains all required grounding rules, including Visualization and Data Integrity.");
    } else {
        if (!hasLiveDataPriority) console.error("❌ FAILURE: Missing 'Live Data Priority' rule.");
        if (!hasOrionHealthCheck) console.error("❌ FAILURE: Missing 'Orion Metrics Health Check' rule.");
        if (!hasTemporalGrounding) console.error("❌ FAILURE: Missing 'Temporal Grounding' rule.");
        if (!hasLagResilience) console.error("❌ FAILURE: Missing 'Resilience to Lag' rule.");
        if (!hasVisualGrounding) console.error("❌ FAILURE: Missing 'Visual Intent Grounding' rule.");
        if (!hasDataIntegrity) console.error("❌ FAILURE: Missing 'Data Integrity' rule.");
    }

    console.log("\n--- GENERATED PROMPT SNIPPET (Visual & Integrity) ---");
    const visualIndex = systemPrompt.indexOf("Visual Intent Grounding");
    if (visualIndex !== -1) {
        console.log(systemPrompt.substring(visualIndex, visualIndex + 600));
    } else {
        console.log("Could not find Visualization block in prompt.");
    }
    console.log("-------------------------------------------\n");

    process.exit(0);
}

verifyFixedMetrics();
