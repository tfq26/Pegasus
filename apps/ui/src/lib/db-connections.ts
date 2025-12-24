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

export type SurrealConfig = {
  uploadId?: string
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
  surrealdb?: SurrealConfig
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
}

export const buildConnectionPayload = (
  entry: ConnectionEntry,
  overrides: ConnectionOverrides = {},
) => {
  switch (entry.provider) {
    case 'mysql':
      return { provider: 'mysql', ...entry.mysql }
    case 'postgres':
      return { provider: 'postgres', ...entry.postgres }
    case 'mongodb':
      // Only include database/collection if explicitly set by user
      const payload: any = { provider: 'mongodb', url: entry.mongodb?.url }
      if (entry.mongodb?.database?.trim()) payload.database = entry.mongodb.database
      if (entry.mongodb?.collection?.trim()) payload.collection = entry.mongodb.collection
      Object.assign(payload, overrides)
      return payload
    case 'kusto':
      return { provider: 'kusto', ...entry.kusto }
    case 'sqlite':
      return { provider: 'sqlite', ...entry.sqlite }
    case 'surrealdb':
      return { provider: 'surrealdb', ...entry.surrealdb }
    default:
      return { provider: entry.provider }
  }
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
