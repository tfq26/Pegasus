import { MongoAdapter } from "./mongoAdapter.js"
import { MySQLAdapter } from "./mySQLAdapter.js"
import { KustoAdapter } from "./kustoAdapter.js"
import { SQLiteAdapter } from "./sqliteAdapter.js"
import { PostgresAdapter } from "./postgresAdapter.js"
import { DuckDBAdapter } from "./duckdbAdapter.js"
import { StorageManager } from "../src/services/storage/StorageManager.js"

export const adapters = {
  mongodb: MongoAdapter,
  mysql: MySQLAdapter,
  kusto: KustoAdapter,
  sqlite: SQLiteAdapter,
  postgres: PostgresAdapter,
  duckdb: DuckDBAdapter,
  local: DuckDBAdapter,
  file: DuckDBAdapter,
  surrealdb: PostgresAdapter
}

/**
 * Helper to create an adapter while resolving local storage paths if needed.
 */
export async function createAdapter(provider, connection, userId) {
  const adapterKey = Object.keys(adapters).find(k => k.toLowerCase() === (provider || '').toLowerCase());
  const Adapter = adapters[adapterKey];
  if (!Adapter) return null;

  let config = { ...connection };
  if (userId && (adapterKey === 'sqlite' || adapterKey === 'duckdb' || adapterKey === 'file')) {
    const rawPath = config.path || config.database || ':memory:';
    if (rawPath && typeof rawPath === 'string' && rawPath !== ':memory:') {
      try {
        const resolvedPath = await StorageManager.getLocalPath(userId, rawPath);
        config.path = resolvedPath;
        config.database = resolvedPath;
      } catch (e) {
        console.error(`[createAdapter] Failed to resolve path for ${provider}:`, e);
      }
    }
  }

  return new Adapter(config);
}
