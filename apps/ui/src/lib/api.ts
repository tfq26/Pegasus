import { buildConnectionPayload } from './db-connections'
import type { ConnectionEntry, Provider } from './db-connections'
import { api, QUERY_API_URL, getAuthHeaders } from './apiClient'

// Re-export for backwards compatibility
export { QUERY_API_URL, getAuthHeaders }

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
    headers: getAuthHeaders(),
    body: JSON.stringify({
      provider: entry.provider,
      connection,
    }),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    const err = new Error(body.error ?? 'Unable to load schema')
      // Attach the backend error code (if present) for richer UI messages
      ; (err as any).code = body.code ?? body.code === 0 ? body.code : undefined
    throw err
  }

  return {
    tables: (body.tables ?? []) as string[],
    previews: (body.previews ?? []) as SchemaPreview[],
    databases: (body.databases ?? undefined) as string[] | undefined,
    tableMetadata: (body.tableMetadata ?? {}) as Record<string, { displayName: string; actualName: string }>,
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
  } else if (provider === 'sqlite') {
    const safeTable = table.replace(/"/g, '""')
    queryPayload = `SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`
  } else if (provider === 'postgres') {
    const safeTable = table.replace(/"/g, '""')
    queryPayload = `SELECT * FROM "${safeTable}" LIMIT ${limit} OFFSET ${offset}`
  } else if (provider === 'surrealdb') {
    // SurrealDB uses SQL-like syntax
    queryPayload = `SELECT * FROM ${table} LIMIT ${limit} START ${offset}`
  } else if (provider === 'mongodb') {
    connection = buildConnectionPayload(entry, { collection: table })
    queryPayload = JSON.stringify({
      filter: {},
      skip: offset,
      limit,
    })
  } else {
    // Kusto and other providers
    const sanitizedTable = table.replace(/"/g, '\\"')
    queryPayload = `${sanitizedTable} | take ${limit}`
  }

  const response = await fetch(`${QUERY_API_URL}/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
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

export async function fetchTableCount({ entry, table }: { entry: ConnectionEntry, table: string }) {
  const provider = entry.provider
  let connection = buildConnectionPayload(entry)
  let queryPayload: string

  if (provider === 'mysql') {
    const safeTable = table.replace(/`/g, '``')
    queryPayload = `SELECT COUNT(*) as count FROM \`${safeTable}\``
  } else if (provider === 'sqlite') {
    const safeTable = table.replace(/"/g, '""')
    queryPayload = `SELECT COUNT(*) as count FROM "${safeTable}"`
  } else if (provider === 'postgres') {
    const safeTable = table.replace(/"/g, '""')
    queryPayload = `SELECT COUNT(*) as count FROM "${safeTable}"`
  } else if (provider === 'surrealdb') {
    queryPayload = `SELECT count() FROM ${table} GROUP ALL`
  } else if (provider === 'mongodb') {
    // MongoDB uses aggregation pipeline for count operations
    // Extract collection name from 'db.collection' format if needed
    const collectionName = table.includes('.') ? table.split('.')[1] : table
    connection = buildConnectionPayload(entry, { collection: collectionName })
    queryPayload = JSON.stringify({
      pipeline: [{ $count: 'count' }]
    })
  } else {
    // Kusto and other providers
    const sanitizedTable = table.replace(/"/g, '\\"')
    queryPayload = `${sanitizedTable} | count`
  }

  const response = await fetch(`${QUERY_API_URL}/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      provider,
      connection,
      query: queryPayload,
    }),
  })

  const body = await response.json()
  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'Unable to fetch count')
  }

  // Parse result based on provider
  const result = body.result
  if (Array.isArray(result) && result.length > 0) {
    const firstRow = result[0]
    // Check common keys for count (SQL: count/Count/COUNT, MongoDB aggregation: count)
    const val = firstRow.count ?? firstRow.Count ?? firstRow.COUNT ?? Object.values(firstRow)[0]
    return Number(val)
  }
  return 0
}

export async function generateAIQuery(prompt: string, connectionId: string, context: any[] = [], activeTable?: string) {
  const requestBody: any = {
    prompt,
    connectionId,
    context
  };

  // Only include activeTable if it has a value
  if (activeTable) {
    requestBody.activeTable = activeTable;
  }

  const response = await fetch(`${QUERY_API_URL}/ai/generate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(requestBody),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'AI generation failed')
  }

  // Check if this is a multi-step response
  if (body.multi_step && Array.isArray(body.steps)) {
    return {
      multi_step: true,
      steps: body.steps,
      usage: body.usage
    }
  }

  return { query: body.query, usage: body.usage }
}

export async function translateQuery(query: string, targetDialect: string, connectionId: string) {
  const prompt = `Translate the following SQL query to ${targetDialect} dialect. Return ONLY the translated SQL query:\n\n${query}`
  return generateAIQuery(prompt, connectionId)
}

export async function explainQuery(query: string, connectionId: string) {
  // Use analyzeResults to get a natural language explanation
  return analyzeResults(`Explain this SQL query in plain English and provide any performance optimization tips:`, [], query)
}



export async function sanitizeTable(table: string) {
  const response = await fetch(`${QUERY_API_URL}/api/table/${table}/sanitize`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include'
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Sanitization failed')
  }

  // Read response as text first so we can log it if parsing fails
  const text = await response.text()

  try {
    return JSON.parse(text)
  } catch (e: any) {
    console.error('Failed to parse sanitize response:', text.substring(0, 500))
    throw new Error(`Invalid JSON response from server: ${e.message}`)
  }
}


export async function executeQuery({ connectionId, query, source = 'user' }: { connectionId: string, query: string, source?: string }) {
  // Try to find provider from connectionId if possible, but connection payload building is complex here without the entry.
  // Actually, standard /query point requires full connection payload + provider.
  // This is tricky because `executeQuery` in `Chat.vue` constructs it from `selectedConnection`.
  // Ideally `SanitizePreviewDialog` should emit 'execute' and let Chat.vue handle it using its known connection state.
  // BUT the plan assumes the dialog executes it.

  // Alternative: Reuse `saveQuery`? No, that's just saving to DB history.

  // Let's assume the caller passes the necessary info or we fetch connection first.
  // Actually, to keep it simple for now, I will modify SanitizePreviewDialog to EMIT the fix request to the parent (Chat.vue),
  // because Chat.vue already has `selectedConnection` and logic to build the payload.

  // SO I WILL ABORT ADDING executeQuery HERE if it requires complex connection payload building that is already in Chat.vue.
  // However, `fetchTableEntries` handles it.

  // Let's defer to Chat.vue for execution.
  return Promise.resolve()
}

export async function analyzeResults(question: string, results: any[], query: string) {
  const response = await fetch(`${QUERY_API_URL}/ai/analyze`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders() as Record<string, string>,
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({
      question,
      results,
      query
    }),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'AI analysis failed')
  }

  return body.analysis
}

export async function searchData(term: string, connectionId: string) {
  const response = await fetch(`${QUERY_API_URL}/ai/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      term,
      connectionId
    }),
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'Search failed')
  }

  return body
}

export async function getAIModels() {
  const response = await fetch(`${QUERY_API_URL}/ai/models`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
  })

  const body = await response.json()

  if (!response.ok || body.error) {
    throw new Error(body.error ?? 'Failed to list models')
  }

  return body.models || []
}

export async function fetchSettings() {
  const response = await fetch(`${QUERY_API_URL}/settings`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  })

  const body = await response.json()

  if (!response.ok) {
    throw new Error('Failed to load settings')
  }

  return body.settings || {}
}

// Chat API
export async function fetchChats() {
  const body = await api.get<{ chats: any[] }>('/chats')
  return body.chats || []
}

export async function createChat(title?: string) {
  return api.post('/chats', { title })
}

export async function fetchChatHistory(chatId: string) {
  return api.get(`/chats/${chatId}`)
}

export async function saveMessage(chatId: string, role: 'user' | 'ai', content: string) {
  return api.post(`/chats/${chatId}/messages`, { role, content })
}

export async function deleteChat(chatId: string) {
  return api.delete(`/chats/${chatId}`)
}

export async function clearAllChats() {
  return api.delete('/chats')
}

// Dashboard API
export async function fetchDashboardElements() {
  const response = await fetch(`${QUERY_API_URL}/dashboard`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to fetch dashboard')
  const body = await response.json()
  return body.elements || []
}

export async function createDashboardElement(element: any) {
  const response = await fetch(`${QUERY_API_URL}/dashboard/elements`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(element)
  })
  if (!response.ok) throw new Error('Failed to create dashboard element')
  return await response.json()
}

export async function deleteDashboardElement(id: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboard/elements/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to delete dashboard element')
  return true
}

export async function updateDashboardElement(id: string, updates: any) {
  const response = await fetch(`${QUERY_API_URL}/dashboard/elements/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to update dashboard element')
  return await response.json()
}

export async function fetchDashboardLayout() {
  const response = await fetch(`${QUERY_API_URL}/dashboard/layout`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to fetch dashboard layout')
  const body = await response.json()
  return body.layout
}

export async function saveDashboardLayout(layout: any[]) {
  const response = await fetch(`${QUERY_API_URL}/dashboard/layout`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders() as Record<string, string>,
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ layout })
  })
  if (!response.ok) throw new Error('Failed to save dashboard layout')
  return await response.json()
}
// AI
export async function recommendVisualization(query: string, results: any[], previousConfig: any = null, suggestedChartType: string | null = null) {
  const response = await fetch(`${QUERY_API_URL}/ai/recommend-visualization`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ query, results, previousConfig, suggestedChartType }),
  })
  if (!response.ok) throw new Error('Failed to get recommendation')
  return response.json()
}

// Queries
export async function fetchQueries() {
  const response = await fetch(`${QUERY_API_URL}/queries`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to fetch queries')
  return response.json()
}

export async function saveQuery(query: string, source: 'user' | 'ai', status: 'success' | 'error', connectionId?: string) {
  const response = await fetch(`${QUERY_API_URL}/queries`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ query, source, status, connection_id: connectionId }),
  })
  if (!response.ok) throw new Error('Failed to save query')
  return response.json()
}

// Dashboard V2 API (Multi-dashboard)
export async function fetchDashboards() {
  const response = await fetch(`${QUERY_API_URL}/dashboards`, {
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!response.ok) throw new Error('Failed to fetch dashboards')
  const body = await response.json()
  return body.dashboards || []
}

export async function fetchSharedDashboards() {
  const response = await fetch(`${QUERY_API_URL}/dashboards/shared`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to fetch shared dashboards')
  const body = await response.json()
  return body.dashboards || []
}

export async function createDashboard(title: string, data: any) {
  const response = await fetch(`${QUERY_API_URL}/dashboards`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ title, data })
  })
  if (!response.ok) throw new Error('Failed to create dashboard')
  return await response.json()
}

export async function fetchDashboard(id: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${id}`, {
    headers: getAuthHeaders(),
    credentials: 'include',
    cache: 'no-store'
  })
  if (!response.ok) throw new Error('Failed to fetch dashboard')
  const body = await response.json()
  return body.dashboard
}

export async function updateDashboard(id: string, updates: { title?: string, data?: any }) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(updates)
  })
  if (!response.ok) throw new Error('Failed to update dashboard')
  return await response.json()
}

export async function updateDashboardPrivacy(id: string, isPublic: boolean) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${id}/privacy`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ is_public: isPublic })
  })
  if (!response.ok) throw new Error('Failed to update privacy settings')
  return await response.json()
}

export async function deleteDashboard(id: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to delete dashboard')
  return true
}

export async function shareDashboard(id: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${id}/share`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to share dashboard')
  const body = await response.json()
  return body.token
}

export async function fetchSharedDashboard(token: string) {
  const response = await fetch(`${QUERY_API_URL}/shared/dashboard/${token}`)
  if (!response.ok) throw new Error('Failed to fetch shared dashboard')
  const body = await response.json()
  return body.dashboard
}

export async function searchUsers(query: string) {
  const response = await fetch(`${QUERY_API_URL}/api/users/search?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to search users')
  const body = await response.json()
  return body.users || []
}

export async function inviteUserToDashboard(dashboardId: string, email: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${dashboardId}/share/invite`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ email })
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to invite user')
  }
  return await response.json()
}

export async function fetchDashboardPermissions(dashboardId: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${dashboardId}/permissions`, {
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to fetch permissions')
  const body = await response.json()
  return body.permissions || []
}

export async function removeDashboardPermission(dashboardId: string, email: string) {
  const response = await fetch(`${QUERY_API_URL}/dashboards/${dashboardId}/permissions/${email}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    credentials: 'include'
  })
  if (!response.ok) throw new Error('Failed to remove user')
  return true
}

export interface FeedbackData {
  userEmail?: string
  featureCategory: string
  customFeature?: string
  issueType: string
  description: string
  browserInfo?: string
  isUrgent: boolean
}

export async function submitFeedback(feedback: FeedbackData) {
  const response = await fetch(`${QUERY_API_URL}/feedback`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders() as Record<string, string>,
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(feedback)
  })

  if (!response.ok) {
    throw new Error('Failed to submit feedback')
  }

  return await response.json()
}

export async function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const headers = getAuthHeaders()
  // @ts-ignore
  delete headers['Content-Type'] // Let fetch set boundary for FormData

  const response = await fetch(`${QUERY_API_URL}/upload`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData
  })

  return await response.json()
}

export async function createCheckoutSession(priceId: string) {
  const response = await fetch(`${QUERY_API_URL}/create-checkout-session`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({ priceId })
  })

  return await response.json()
}

export async function createPortalSession() {
  const response = await fetch(`${QUERY_API_URL}/create-portal-session`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include'
  })

  return await response.json()
}
export async function saveConnection(connection: any) {
  // Convert 'file' provider to 'sqlite' for backend compatibility
  const connectionToSave = { ...connection }
  if (connectionToSave.provider === 'file') {
    connectionToSave.provider = 'sqlite'
  }

  console.log('[API] Saving connection:', connectionToSave)
  return api.post('/connections', connectionToSave)
}

export async function updateConnection(connection: any) {
  // Convert 'file' provider to 'sqlite' for backend compatibility
  const connectionToSave = { ...connection }
  if (connectionToSave.provider === 'file') {
    connectionToSave.provider = 'sqlite'
  }

  return api.put(`/connections/${connection.id}`, connectionToSave)
}

export async function deleteConnection(id: string) {
  return api.delete(`/connections/${id}`)
}

export async function getSubscriptionStatus() {
  return api.get('/subscription-status')
}

export async function getUsageStats() {
  return api.get('/usage')
}

export async function syncSubscription() {
  const response = await fetch(`${QUERY_API_URL}/sync-subscription`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
  })
  return await response.json()
}

export async function uploadDashboardFile(dashboardId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const headers = getAuthHeaders()
  // @ts-ignore
  delete headers['Content-Type']

  const response = await fetch(`${QUERY_API_URL}/dashboards/${dashboardId}/files`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData
  })
  if (!response.ok) throw new Error('Failed to upload file')
  return await response.json()
}

export function getFileDownloadUrl(fileId: string) {
  return `${QUERY_API_URL}/files/${fileId}`
}

export async function logOperationToBackend(data: any) {
  const response = await fetch(`${QUERY_API_URL}/operations`, {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to log operation')
  return response.json()
}

export async function fetchOperationHistory(limit = 50) {
  const response = await fetch(`${QUERY_API_URL}/operations/history?limit=${limit}`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch operation history')
  return response.json()
}

export async function fetchOperationAnalytics(range = 'day') {
  const response = await fetch(`${QUERY_API_URL}/operations/analytics?range=${range}`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Failed to fetch operation analytics')
  return response.json()
}

export async function renameTable(connection: ConnectionEntry, table: string, newName: string) {
  const payload = buildConnectionPayload(connection)
  return api.post('/query/rename-table', {
    connection: payload,
    table,
    newName
  })
}

export async function deleteTable(connection: ConnectionEntry, table: string) {
  const payload = buildConnectionPayload(connection)
  return api.post('/query/delete-table', {
    connection: payload,
    table
  })
}

export async function fetchDatabaseTables(connection: ConnectionEntry, dbName: string) {
  const payload = buildConnectionPayload(connection)
  return api.post('/query/database-tables', {
    connection: payload,
    database: dbName
  })
}
