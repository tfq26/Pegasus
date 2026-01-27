
import { SQLiteAdapter } from "./adapters/sqliteAdapter.js";
import { resolveDatabasePath } from "./src/utils/resolveDatabasePath.js";

async function inspectSQLite() {
    const dbPath = "uploads/user_01K8FGQG2NSJZJ7K38QFBS8CJD/d9faebad-5c85-45a6-a724-4d337f075141-investment_demo.db";
    const userId = "user_01K8FGQG2NSJZJ7K38QFBS8CJD";

    console.log("Resolving path...");
    const resolved = await resolveDatabasePath(dbPath, userId);
    console.log("Resolved:", resolved);

    const adapter = new SQLiteAdapter({ path: resolved });
    await adapter.connect();

    const tables = await adapter.listCollections();
    console.log("Tables in SQLite DB:", tables);

    process.exit(0);
}

inspectSQLite();
