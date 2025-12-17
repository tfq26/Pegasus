import type { ConnectionEntry, Provider, MySQLConfig, MongoConfig, KustoConfig, SQLiteConfig, PostgresConfig } from '@/lib/db-connections'
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
  surrealdb: {
    uploadId?: string
  }
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
  surrealdb: {}
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
}
