export type Provider = 'mysql' | 'mongodb' | 'kusto' | 'sqlite' | 'postgres' | 'file' | 'surrealdb'

export type MySQLConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export type PostgresConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl?: boolean
  connectionString?: string
}

export type MongoConfig = {
  url: string
  database: string
  collection: string
}

export type KustoConfig = {
  cluster: string
  database: string
  tenantId?: string
  clientId?: string
  clientSecret?: string
}

export type SQLiteConfig = {
  path: string
  database?: string
  authToken?: string
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

export type ConnectionEntry = {
  id: string
  nickname: string
  description?: string
  provider: Provider
  mysql?: MySQLConfig
  postgres?: PostgresConfig
  mongodb?: MongoConfig
  kusto?: KustoConfig
  sqlite?: SQLiteConfig
  file?: FileConfig
  surrealdb?: SurrealConfig
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
  const isRawEntry = entry.mongodb || entry.mysql || entry.postgres || entry.sqlite || entry.surrealdb || entry.kusto;
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
    case 'surrealdb':
      basePayload = { provider: 'surrealdb', ...entry.surrealdb }
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
