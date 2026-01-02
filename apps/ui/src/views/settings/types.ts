import type { ConnectionEntry, Provider, MySQLConfig, MongoConfig, KustoConfig, SQLiteConfig, PostgresConfig, SurrealConfig } from '@/lib/db-connections'
import type { SchemaPreview } from '@/lib/api'

export type ConnectionFormState = {
  nickname: string
  description: string
  provider: Provider
  mysql: MySQLConfig
  postgres: PostgresConfig
  mongodb: MongoConfig
  kusto: KustoConfig
  sqlite: SQLiteConfig
  surrealdb: SurrealConfig
  isLocked: boolean
}

export const defaultConnectionForm: ConnectionFormState = {
  nickname: '',
  provider: 'mysql',
  description: '',
  mysql: { host: '', port: 3306, database: '', user: '', password: '' },
  postgres: { host: '', port: 5432, database: '', user: '', password: '', ssl: false },
  mongodb: { url: '', database: '', collection: '' },
  kusto: { cluster: '', database: '', tenantId: '', clientId: '', clientSecret: '' },
  sqlite: { path: '', authToken: '' },
  surrealdb: { protocol: 'ws', host: '127.0.0.1', port: 8000, namespace: 'test', database: 'test', username: 'root', password: 'root' },
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
  githubConnected: boolean
  slackConnected: boolean
  azureConnected: boolean
  enabledModels?: string[]
  activeModel?: string
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
