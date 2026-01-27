
import { DuckDBAdapter } from "./adapters/duckdbAdapter.js";
import { ConnectionAnalyzer } from "./src/services/ConnectionAnalyzer.js";

async function testAnalyzer() {
    const config = {
        path: "uploads/user_01K8FGQG2NSJZJ7K38QFBS8CJD/612e25db-314c-41f9-a5b4-cf648348a8a6-SectorPerformance2024.csv"
    };

    const userId = "user_01K8FGQG2NSJZJ7K38QFBS8CJD";

    console.log("Connecting to DuckDB Adapter...");
    const adapter = new DuckDBAdapter(config, userId);
    await adapter.connect();

    console.log("Running ConnectionAnalyzer...");
    const result = await ConnectionAnalyzer.analyze(adapter, 'duckdb');

    console.log("-----------------------------------");
    console.log("Tables:", JSON.stringify(result.normalizedSchema.tables, null, 2));
    console.log("Mappings:", JSON.stringify(result.normalizedSchema.mappings, null, 2));
    console.log("-----------------------------------");

    process.exit(0);
}

testAnalyzer();
