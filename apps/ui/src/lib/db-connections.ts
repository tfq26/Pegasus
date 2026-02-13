export type Provider = 'mysql' | 'mongodb' | 'kusto' | 'sqlite' | 'postgres' | 'file' | 'surrealdb' | 'ai_provider' | 'cloud_storage' | 'duckdb' | 'dynamodb' | 'bigquery' | 'cosmosdb'

export type CosmosConfig = {
  endpoint: string
  key: string
  database: string
  container?: string
  enableLiveCache?: boolean
  pollingInterval?: number
}

export type MySQLConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  enableSync?: boolean
  enableLiveCache?: boolean
  pollingInterval?: number
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
  enableLiveCache?: boolean
  pollingInterval?: number
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
  enableLiveCache?: boolean
  pollingInterval?: number
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

export type DynamoDBConfig = {
  region: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string // for local dynamodb
  enableLiveCache?: boolean
  pollingInterval?: number
}

export type BigQueryConfig = {
  projectId: string
  keyFile?: string // Path to JSON key file
  credentials?: string // JSON string content
  location?: string
  enableLiveCache?: boolean
  pollingInterval?: number
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
  dynamodb?: DynamoDBConfig
  bigquery?: BigQueryConfig
  ai_provider?: AIProviderConfig
  cloud_storage?: CloudStorageConfig
  cosmosdb?: CosmosConfig
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
  const isRawEntry = entry.mongodb || entry.mysql || entry.postgres || entry.sqlite || entry.duckdb || entry.surrealdb || entry.kusto || entry.ai_provider || entry.cloud_storage || entry.cosmosdb;
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
    case 'dynamodb':
      basePayload = { provider: 'dynamodb', ...entry.dynamodb }
      break
    case 'bigquery':
      basePayload = { provider: 'bigquery', ...entry.bigquery }
      break
    case 'cosmosdb':
      basePayload = { provider: 'cosmosdb', ...entry.cosmosdb }
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

/**
 * Identify if a connection is a static file upload (Excel, CSV, local file)
 * Based on provider type - live database connections can be refreshed, file uploads cannot.
 */
export const isStaticSource = (conn: any): boolean => {
  if (!conn) return false

  // System connections (like system:orion_metrics) are always live
  if (conn.id && conn.id.startsWith('system:')) {
    return false
  }

  const provider = conn.provider || conn.type

  // Live/refreshable providers - these connect to actual databases/services
  const liveProviders = [
    'mysql',
    'postgres',
    'mongodb',
    'cosmosdb',
    'kusto',
    'dynamodb',
    'bigquery',
    'surrealdb'
  ]

  // Static providers - file uploads that cannot be refreshed
  const staticProviders = [
    'file'  // Explicit file uploads (CSV, Excel, etc.)
  ]

  // Check explicit static providers first
  if (staticProviders.includes(provider)) {
    return true
  }

  // Check explicit live providers
  if (liveProviders.includes(provider)) {
    return false
  }

  // For DuckDB and SQLite, we need to distinguish between:
  // 1. Remote databases (Turso, etc.) - live/refreshable
  // 2. Local file uploads - static
  if (provider === 'sqlite' || provider === 'duckdb') {
    // Check for remote database indicators
    const path = conn.path || conn.config?.path || conn.sqlite?.path || conn.duckdb?.path || ''

    // Remote databases (like Turso) are live
    if (path.includes('turso.io') || (path.includes('://') && !path.startsWith('file:'))) {
      return false
    }

    // Check if explicitly marked as locked/virtual (uploaded files)
    if (conn.isLocked || conn.isVirtual) {
      return true
    }

    // Check for file upload indicators in the name/path
    const searchStr = [
      conn.nickname,
      conn.alias,
      conn.name,
      path
    ].filter(Boolean).join(' ').toLowerCase()

    // If it has file extensions, it's likely an uploaded file
    if (searchStr.includes('.xlsx') || searchStr.includes('.xls') ||
      searchStr.includes('.csv') || searchStr.includes('.parquet')) {
      return true
    }

    // Default: local SQLite/DuckDB without remote indicators = static
    return true
  }

  // Unknown provider - assume it's live to be safe
  return false
}

export { getMongoDatabaseFromUrl }
