import type { ConnectionEntry, Provider, MySQLConfig, MongoConfig, KustoConfig } from '@/lib/db-connections'
import type { SchemaPreview } from '@/lib/api'

export type ConnectionFormState = {
  nickname: string
  description: string
  provider: Provider
  mysql: MySQLConfig
  mongodb: MongoConfig
  kusto: KustoConfig
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
}
