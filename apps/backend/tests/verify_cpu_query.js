
import { DataContextService } from '../src/services/DataContextService.js';
import { spreadsheetToolService } from '../src/services/SpreadsheetToolService.js';
import 'dotenv/config';

async function testCpuQuery() {
    console.log("🧪 Testing AI CPU Query (OrionMetrics Injection)...");

    const userId = "test-user";

    // 1. Build Context (Should trigger System Injection)
    console.log("   Building Data Context...");
    try {
        const context = await DataContextService.buildContext(userId, 'connection:local', {});
        const schema = context.normalizedSchema;

        // 2. Verify Schema Injection
        const hasOrionMetrics = schema.tables.some(t =>
            t.toLowerCase().includes('orionmetrics') || t.toLowerCase().includes('orion_metrics')
        );
        if (!hasOrionMetrics) {
            console.error("❌ FAILURE: 'OrionMetrics' NOT found in schema tables.");
            console.log("   Tables found:", schema.tables);
            process.exit(1);
        } else {
            console.log("✅ 'OrionMetrics' successfully injected into schema (found variant).");
        }

        // 3. Verify Adapter Mapping
        const adapter = context.resourceToAdapter['OrionMetrics'];
        if (!adapter || adapter.constructor.name !== 'CosmosAdapter') {
            console.error("❌ FAILURE: 'OrionMetrics' not mapped to CosmosAdapter.");
            process.exit(1);
        } else {
            console.log("✅ 'OrionMetrics' correctly mapped to CosmosAdapter.");
        }

        // 4. Test Query Execution (Simulate AI tool call)
        console.log("   Executing test query: SELECT * FROM OrionMetrics LIMIT 1");
        try {
            const results = await adapter.query("SELECT * FROM c OFFSET 0 LIMIT 1"); // Cosmos SQL syntax
            console.log("✅ Query Success! Record count:", results.length);
            if (results.length > 0) {
                console.log("   Sample Record:", JSON.stringify(results[0]).substring(0, 100) + "...");
            } else {
                console.warn("⚠️ Query returned 0 records (Container might be empty).");
            }
            process.exit(0);

        } catch (e) {
            console.error("❌ Query Failed:", e.message);
            process.exit(1);
        }

    } catch (e) {
        console.error("❌ Context Build Failed:", e);
        process.exit(1);
    }
}

testCpuQuery();
