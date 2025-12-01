import { MySQLAdapter } from "./mySQLAdapter.js"
import { MongoAdapter } from "./mongoAdapter.js"
import { KustoAdapter } from "./kustoAdapter.js"

export const adapters = {
  mysql: MySQLAdapter,
  mongodb: MongoAdapter,
  kusto: KustoAdapter,
}
