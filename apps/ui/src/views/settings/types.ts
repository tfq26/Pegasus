import type { ConnectionEntry, Provider, MySQLConfig, MongoConfig, KustoConfig, SQLiteConfig, DuckDBConfig, PostgresConfig, SurrealConfig, AIProviderConfig, CloudStorageConfig, DynamoDBConfig, BigQueryConfig, CosmosConfig } from '@/lib/db-connections'
import type { SchemaPreview } from '@/lib/api'

export type ConnectionFormState = {
  nickname: string
  alias: string
  description: string
  provider: Provider
  spaceId?: string | null
  mysql: MySQLConfig
  postgres: PostgresConfig
  mongodb: MongoConfig
  kusto: KustoConfig
  sqlite: SQLiteConfig
  duckdb: DuckDBConfig
  surrealdb: SurrealConfig
  dynamodb: DynamoDBConfig
  bigquery: BigQueryConfig
  ai_provider: AIProviderConfig
  cloud_storage: CloudStorageConfig
  cosmosdb: CosmosConfig
  isLocked: boolean
}

export const defaultConnectionForm: ConnectionFormState = {
  nickname: '',
  alias: '',
  provider: 'mysql',
  description: '',
  mysql: { host: '', port: 3306, database: '', user: '', password: '', enableLiveCache: false, pollingInterval: 300 },
  postgres: { host: '', port: 5432, database: '', user: '', password: '', ssl: false, enableLiveCache: false, pollingInterval: 300 },
  mongodb: { url: '', database: '', collection: '', enableLiveCache: false, pollingInterval: 300 },
  kusto: { cluster: '', database: '', tenantId: '', clientId: '', clientSecret: '', enableLiveCache: false, pollingInterval: 300 },
  sqlite: { path: '', authToken: '', enableLiveCache: false, pollingInterval: 300 },
  duckdb: { path: '' },
  surrealdb: { protocol: 'ws', host: '127.0.0.1', port: 8000, namespace: 'test', database: 'test', username: 'root', password: 'root' },
  dynamodb: { region: 'us-east-1', accessKeyId: '', secretAccessKey: '', enableLiveCache: false, pollingInterval: 300 },
  bigquery: { projectId: '', enableLiveCache: false, pollingInterval: 300 },
  ai_provider: { service: 'openai', apiKey: '', allowedModels: [], defaultModel: '' },
  cloud_storage: { service: 'azure_blob', connectionString: '', allowedBuckets: [], bucket: '' },
  cosmosdb: { endpoint: '', key: '', database: '' },
  isLocked: false
}

export type ConnectionStatusState = {
  status: 'loading' | 'connected' | 'error'
  tables: string[]
  previews?: SchemaPreview[]
  error?: string
  errorCode?: string
}

export type SettingsModel = {
  language: string
  aiDetail: number
  enableContext: boolean
  enableCodeHints: boolean
  autoSaveQueries: boolean
  syntaxHighlighting: boolean
  showQueryTips: boolean
  autoRefresh: boolean
  showRowCount: boolean
  cloudProvider: string
  cloudRegion: string
  showDashboardGrid: boolean
  compactMode: boolean
  dashboardLocked: boolean
  githubConnected: boolean
  slackConnected: boolean
  azureConnected: boolean
  enabledModels?: string[]
  activeModel?: string
  localModel?: string
  temperature?: number
  maxTokens?: number
  customInstructions?: string
  defaultPageSize?: number
  dateFormat?: 'iso' | 'local' | 'relative'
  csvDelimiter?: ',' | ';' | '\t'
  confirmDestructive?: boolean
  notifications?: boolean
  chatAutoDeleteDays?: number
  azureCredentials?: {
    tenantId: string
    clientId: string
    clientSecret: string
    subscriptionId: string
  }
  awsCredentials?: {
    accessKeyId: string
    secretAccessKey: string
    region: string
  }
}
