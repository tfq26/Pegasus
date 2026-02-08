
import { DataContextService } from '../src/services/DataContextService.js';
import { PromptBuilder } from '../ai/PromptBuilder.js';
import { OneContext } from '../src/services/OneContext.js';
import 'dotenv/config';

async function verifyFix() {
    console.log("🧪 VERIFYING OrionMetrics FIX...");

    const userId = "test-user";
    const userMessage = "List any servers that are currently 'online' but have a CPU usage over 80% or an Error Message that isn't null. @[TerminalName: bun.exe, ProcessId: 82257]";

    console.log("\n1. Testing OneContext Mention Filtering...");
    const mentions = OneContext.parseMentions(userMessage);
    console.log("   Mentions found:", mentions.map(m => m.token));
    if (mentions.some(m => m.name.includes('TerminalName'))) {
        console.error("   ❌ FAILURE: TerminalName mention should have been filtered out.");
    } else {
        console.log("   ✅ SUCCESS: Terminal metadata filtered out.");
    }

    console.log("\n2. Building Data Context (System Injection)...");
    process.env.DATABASE_URL = "postgres://fake:fake@fake/fake"; // Mock for schema fetch
    const context = await DataContextService.buildContext(userId, 'connection:local', {
        resolvedResources: []
    });

    const orionRegistry = context.normalizedSchema.sourceRegistry['OrionMetrics'];
    console.log("   OrionMetrics in registry:", !!orionRegistry);
    if (orionRegistry) {
        console.log("   Provider:", orionRegistry.provider);
        console.log("   AI Insights:", JSON.stringify(context.normalizedSchema.semanticContext.sourceInsights['OrionMetrics']));
    }

    console.log("\n3. Generating System Prompt...");
    const systemPrompt = PromptBuilder.buildQueryPrompt({
        dialect: 'cosmosdb',
        schema: context.normalizedSchema,
        userMessage: userMessage
    });

    console.log("   Dialect Instructions Check (Cosmos DB):", systemPrompt.includes("COSMOS DB INSTRUCTIONS:"));
    console.log("   Example Check (Fixed Orion SQL):", systemPrompt.includes("SELECT c.serverName, c.cpuPercent, c.errorMessage FROM c WHERE c.status = 'online'"));
    console.log("   Kusto Example Check (Should be Gone):", !systemPrompt.includes("OrionMetrics | summarize"));

    if (systemPrompt.includes("SELECT c.serverName, c.cpuPercent, c.errorMessage FROM c") && !systemPrompt.includes("OrionMetrics | summarize")) {
        console.log("   ✅ SUCCESS: Prompt correctly reconciled.");
    } else {
        console.error("   ❌ FAILURE: Prompt still contains Kusto examples or lacks correct Cosmos SQL examples.");
    }

    console.log("\n🧪 VERIFICATION COMPLETE.");
    process.exit(0);
}

verifyFix().catch(e => {
    console.error(e);
    process.exit(1);
});
