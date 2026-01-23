export type Provider = 'mysql' | 'mongodb' | 'kusto' | 'sqlite' | 'postgres' | 'file' | 'surrealdb' | 'ai_provider' | 'cloud_storage' | 'duckdb'

export type MySQLConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  enableSync?: boolean
}

export type PostgresConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
  connectionString?: string
  enableSync?: boolean
}

export type MongoConfig = {
  url: string
  database: string
  collection: string
  enableLiveCache?: boolean
  pollingInterval?: number
}

export type KustoConfig = {
  cluster: string
  database: string
  tenantId?: string
  clientId?: string
  clientSecret?: string
  enableLiveCache?: boolean
  pollingInterval?: number
}

export type SQLiteConfig = {
  path: string
  database?: string
  authToken?: string
  tables?: string[]
  enableSync?: boolean
}

export type DuckDBConfig = {
  path: string
  schema?: string
  tables?: string[]
}

export type FileConfig = {
  path: string
  type?: 'csv' | 'json' | 'xlsx'
}

export type SurrealConfig = {
  uploadId?: string
  host?: string
  port?: number
  namespace?: string
  database?: string
  username?: string
  password?: string
  protocol?: 'ws' | 'http' | 'wss' | 'https'
  url?: string
}

export type AIProviderConfig = {
  service: 'openai' | 'anthropic' | 'azure_openai' | 'custom'
  apiKey: string // stored as vault:// reference
  baseUrl?: string
  allowedModels?: string[]
  defaultModel?: string
}

export type CloudStorageConfig = {
  service: 'azure_blob' | 's3' | 'gcs'
  connectionString?: string // for Azure
  accessKey?: string // for S3
  secretKey?: string // for S3
  region?: string
  bucket?: string // default bucket
  allowedBuckets?: string[] // whitelist
}

export type ConnectionEntry = {
  id: string
  nickname: string
  alias?: string
  description?: string
  provider: Provider
  space?: string
  mysql?: MySQLConfig
  postgres?: PostgresConfig
  mongodb?: MongoConfig
  kusto?: KustoConfig
  sqlite?: SQLiteConfig
  duckdb?: DuckDBConfig
  file?: FileConfig
  surrealdb?: SurrealConfig
  ai_provider?: AIProviderConfig
  cloud_storage?: CloudStorageConfig
  isLocked?: boolean
}

export const CONNECTION_STORAGE_KEY = 'pegasus-db-connections'

export const defaultConnections: ConnectionEntry[] = [
  {
    id: 'local-mysql',
    nickname: 'Local MySQL',
    description: 'Pegasus dev MySQL on localhost',
    provider: 'mysql',
    mysql: {
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'pegasus',
    },
  },
  {
    id: 'local-mongo',
    nickname: 'Local MongoDB',
    description: 'MongoDB instance for log playback',
    provider: 'mongodb',
    mongodb: {
      url: 'mongodb://127.0.0.1:27017',
      database: '',
      collection: '',
    },
  },
]

export type ConnectionOverrides = {
  collection?: string
  database?: string
}

export const buildConnectionPayload = (
  entry: ConnectionEntry,
  overrides: ConnectionOverrides = {},
) => {
  const isRawEntry = entry.mongodb || entry.mysql || entry.postgres || entry.sqlite || entry.duckdb || entry.surrealdb || entry.kusto || entry.ai_provider || entry.cloud_storage;
  if (!isRawEntry) return { ...entry, ...overrides };

  let basePayload: any = {}
  switch (entry.provider) {
    case 'mysql':
      basePayload = { provider: 'mysql', ...entry.mysql }
      break
    case 'postgres':
      basePayload = { provider: 'postgres', ...entry.postgres }
      break
    case 'mongodb':
      basePayload = { provider: 'mongodb', url: entry.mongodb?.url }
      if (entry.mongodb?.database?.trim()) basePayload.database = entry.mongodb.database
      if (entry.mongodb?.collection?.trim()) basePayload.collection = entry.mongodb.collection
      break
    case 'kusto':
      basePayload = { provider: 'kusto', ...entry.kusto }
      break
    case 'sqlite':
      basePayload = { provider: 'sqlite', ...entry.sqlite }
      break
    case 'duckdb':
      basePayload = { provider: 'duckdb', ...entry.duckdb }
      break
    case 'file':
      // File uploads use DuckDB, path is stored in sqlite.path
      basePayload = { provider: 'file', ...entry.sqlite }
      break
    case 'surrealdb':
      basePayload = { provider: 'surrealdb', ...entry.surrealdb }
      break

    case 'ai_provider':
      basePayload = { provider: 'ai_provider', ...entry.ai_provider }
      break
    case 'cloud_storage':
      basePayload = { provider: 'cloud_storage', ...entry.cloud_storage }
      break
    default:
      basePayload = { provider: entry.provider }
  }
  return { ...basePayload, ...overrides }
}

const getMongoDatabaseFromUrl = (uri?: string | undefined): string | undefined => {
  if (!uri) return undefined
  try {
    const parsed = new URL(uri)
    const path = parsed.pathname || ''
    const database = path.replace(/^\//, '')
    return database || undefined
  } catch {
    return undefined
  }
}

export { getMongoDatabaseFromUrl }
