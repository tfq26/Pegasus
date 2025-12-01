export type Provider = 'mysql' | 'mongodb' | 'kusto'

export type MySQLConfig = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export type MongoConfig = {
  url: string
  database: string
  collection: string
}

export type KustoConfig = {
  cluster: string
  database: string
}

export type ConnectionEntry = {
  id: string
  nickname: string
  description?: string
  provider: Provider
  mysql?: MySQLConfig
  mongodb?: MongoConfig
  kusto?: KustoConfig
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
      return { ...entry.mysql }
    case 'mongodb':
      // Only include database/collection if explicitly set by user
      const payload: any = { url: entry.mongodb?.url }
      if (entry.mongodb?.database?.trim()) payload.database = entry.mongodb.database
      if (entry.mongodb?.collection?.trim()) payload.collection = entry.mongodb.collection
      Object.assign(payload, overrides)
      return payload
    case 'kusto':
      return { ...entry.kusto }
    default:
      return {}
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
