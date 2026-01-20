import { MongoAdapter } from "./mongoAdapter.js"
import { MySQLAdapter } from "./mySQLAdapter.js"
import { KustoAdapter } from "./kustoAdapter.js"
import { SQLiteAdapter } from "./sqliteAdapter.js"
import { PostgresAdapter } from "./postgresAdapter.js"
import { DuckDBAdapter } from "./duckdbAdapter.js"

export const adapters = {
  mongodb: MongoAdapter,
  mysql: MySQLAdapter,
  kusto: KustoAdapter,
  sqlite: SQLiteAdapter,
  postgres: PostgresAdapter,
  duckdb: DuckDBAdapter,
  local: DuckDBAdapter,
  surrealdb: PostgresAdapter
}
