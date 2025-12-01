import { buildConnectionPayload } from './db-connections'
import type { ConnectionEntry, Provider } from './db-connections'

const DEFAULT_QUERY_API_URL = 'http://localhost:3000'

const derivedApiUrl =
  (typeof window !== 'undefined'
    ? (window as Window & { __QUERY_API_URL__?: string }).__QUERY_API_URL__
    : undefined) ?? DEFAULT_QUERY_API_URL

export const QUERY_API_URL = derivedApiUrl

export type TableQueryOptions = {
  entry: ConnectionEntry
  table: string
  page: number
  limit?: number
}

export type SchemaPreview = {
  table: string
  rows: Record<string, unknown>[]
}

export type ConnectionSchema = {
  tables: string[]
  previews: SchemaPreview[]
  databases?: string[]
}

export async function fetchConnectionSchema(entry: ConnectionEntry) {
  const connection = buildConnectionPayload(entry)
  const response = await fetch(`${QUERY_API_URL}/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: entry.provider,
      connection,
    }),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    const err = new Error(body.error ?? 'Unable to load schema')
    // Attach the backend error code (if present) for richer UI messages
    ;(err as any).code = body.code ?? body.code === 0 ? body.code : undefined
    throw err
  }

  return {
    tables: (body.tables ?? []) as string[],
    previews: (body.previews ?? []) as SchemaPreview[],
    databases: (body.databases ?? undefined) as string[] | undefined,
  }
}

export async function fetchTableEntries({
  entry,
  table,
  page,
  limit = 10,
}: TableQueryOptions) {
  const actualPage = Math.max(1, page)
  const offset = (actualPage - 1) * limit
  const provider = entry.provider
  let connection = buildConnectionPayload(entry)
  let queryPayload: string

  if (provider === 'mysql') {
    const safeTable = table.replace(/`/g, '``')
    queryPayload = `SELECT * FROM \`${safeTable}\` LIMIT ${limit} OFFSET ${offset}`
  } else if (provider === 'mongodb') {
    connection = buildConnectionPayload(entry, { collection: table })
    queryPayload = JSON.stringify({
      filter: {},
      skip: offset,
      limit,
    })
  } else {
    const sanitizedTable = table.replace(/"/g, '\\"')
    queryPayload = `${sanitizedTable} | take ${limit}`
  }

  const response = await fetch(`${QUERY_API_URL}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      connection,
      query: queryPayload,
    }),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'Unable to fetch table entries')
  }

  const rows = Array.isArray(body.result) ? body.result : []
  return {
    rows,
    hasNext: rows.length === limit,
    page: actualPage,
  }
}
