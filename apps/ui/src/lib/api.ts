import { buildConnectionPayload } from './db-connections'
import type { ConnectionEntry, Provider } from './db-connections'
import { api, QUERY_API_URL, getAuthHeaders } from './apiClient'
import { sendDesktopNotification } from './desktop'

// Re-export for backwards compatibility
export { api, QUERY_API_URL, getAuthHeaders }

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
  const body = await api.post<any>('/schema', {
    provider: entry.provider,
    connection,
  })

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

  const body = await api.post<any>('/query', {
    provider,
    connection,
    query: queryPayload,
  })

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

  const body = await api.post<any>('/query', {
    provider,
    connection,
    query: queryPayload,
  })

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

export async function generateAIQuery(prompt: string, connectionId: string, context: any[] = [], activeTable?: string, options: { temperature?: number, maxTokens?: number, model?: string } = {}) {
  const requestBody: any = {
    prompt,
    connectionId,
    context,
    model: options.model,
    ...options
  };

  if (activeTable) requestBody.activeTable = activeTable;
  const body = await api.post<any>('/ai/generate', requestBody)
  return { ...body, query: body.query, usage: body.usage }
}

export async function generateAIQueryStream(
  prompt: string,
  connectionId: string,
  context: any[] = [],
  activeTable?: string,
  options: {
    temperature?: number,
    maxTokens?: number,
    model?: string,
    onChunk?: (chunk: string) => void,
    onToolCall?: (toolCalls: any[]) => void,
    onToolResult?: (result: any) => void,
    onDone?: (usage: any) => void
  } = {}
) {
  const requestBody: any = {
    prompt,
    connectionId,
    context,
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens
  };
  if (activeTable) requestBody.activeTable = activeTable;

  const response = await fetch(`${QUERY_API_URL}/ai/generate/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Streaming failed');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream not supported');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === 'text') options.onChunk?.(data.content);
        else if (data.type === 'tool_calls') options.onToolCall?.(data.content);
        else if (data.type === 'tool_result') options.onToolResult?.(data.content);
        else if (data.type === 'done') options.onDone?.(data.usage);
        else if (data.type === 'error') throw new Error(data.content);
      } catch (e) {
        console.warn('[Stream] Parse error:', e, line);
      }
    }
  }
}


export async function translateQuery(query: string, targetDialect: string, connectionId: string) {
  const prompt = `Translate the following SQL query to ${targetDialect} dialect. Return ONLY the translated SQL query:\n\n${query}`
  return generateAIQuery(prompt, connectionId)
}

export async function explainQuery(query: string, connectionId: string) {
  return api.post<any>('/ai/explain-query', { query, connectionId })
}

export async function optimizeQuery(query: string, connectionId: string) {
  return api.post<any>('/ai/optimize-query', { query, connectionId })
}



export async function checkHealthProfile(connectionId: string) {
  return api.post<any>('/ai/health-profile', { connectionId })
}

export async function explainTable(connectionId: string, tableName: string) {
  return api.post<any>('/ai/explain-table', { connectionId, tableName })
}


export async function sanitizeTable(table: string) {
  return api.post<any>(`/api/table/${table}/sanitize`)
}

export async function generateTestData(connectionId: string, tableName: string, count: number, hint?: string, model?: string) {
  return api.post<{ sql: string }>('/ai/generate-data', {
    connectionId,
    tableName,
    count,
    hint,
    model
  })
}

export async function wrangleData(prompt: string, model?: string) {
  return api.post<{ code: string }>('/ai/data-wrangler', {
    prompt,
    model
  })
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
  const body = await api.post<any>('/ai/analyze', {
    question,
    results,
    query
  })

  return body.analysis
}

export async function searchData(term: string, connectionId: string) {
  return api.post<any>('/ai/search', {
    term,
    connectionId
  })
}

export async function getAIModels() {
  const body = await api.get<{ models: any[] }>('/ai/models')
  return body.models || []
}

export async function fetchSettings() {
  const body = await api.get<{ settings: any }>('/settings')
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
  const body = await api.get<{ elements: any[] }>('/dashboard')
  return body.elements || []
}

export async function createDashboardElement(element: any) {
  return api.post('/dashboard/elements', element)
}

export async function deleteDashboardElement(id: string) {
  return api.delete(`/dashboard/elements/${id}`)
}

export async function updateDashboardElement(id: string, updates: any) {
  return api.put(`/dashboard/elements/${id}`, updates)
}

export async function fetchDashboardLayout() {
  const body = await api.get<{ layout: any }>('/dashboard/layout')
  return body.layout
}

export async function saveDashboardLayout(layout: any[]) {
  return api.post('/dashboard/layout', { layout })
}
// AI
export async function recommendVisualization(query: string, results: any[], previousConfig: any = null, suggestedChartType: string | null = null) {
  return api.post('/ai/recommend-visualization', { query, results, previousConfig, suggestedChartType })
}

// Queries
export async function fetchQueries() {
  return api.get('/queries')
}

export async function saveQuery(query: string, source: 'user' | 'ai', status: 'success' | 'error', connectionId?: string) {
  return api.post('/queries', { query, source, status, connection_id: connectionId })
}

export async function deleteQuery(queryId: string) {
  return api.delete(`/queries/${queryId}`)
}

export async function clearAllQueries() {
  return api.delete('/queries')
}

// Dashboard V2 API (Multi-dashboard)
export async function fetchDashboards() {
  const body = await api.get<{ dashboards: any[] }>('/dashboards')
  return body.dashboards || []
}

export async function fetchSharedDashboards() {
  const body = await api.get<{ dashboards: any[] }>('/dashboards/shared')
  return body.dashboards || []
}

export async function createDashboard(title: string, data: any) {
  return api.post<{ id: string }>('/dashboards', { title, data })
}

export async function fetchDashboard(id: string) {
  const body = await api.get<{ dashboard: any }>(`/dashboards/${id}`)
  return body.dashboard
}

export async function updateDashboard(id: string, updates: { title?: string, data?: any }) {
  return api.put(`/dashboards/${id}`, updates)
}

export async function updateDashboardPrivacy(id: string, isPublic: boolean) {
  return api.put(`/dashboards/${id}/privacy`, { is_public: isPublic })
}

export async function deleteDashboard(id: string) {
  return api.delete(`/dashboards/${id}`)
}

export async function shareDashboard(id: string) {
  const body = await api.post<{ token: string }>(`/dashboards/${id}/share`)
  return body.token
}

export async function fetchSharedDashboard(token: string) {
  const body = await api.get<{ dashboard: any }>(`/shared/dashboard/${token}`)
  return body.dashboard
}

export async function fetchRecentDashboards() {
  const body = await api.get<{ dashboards: any[] }>('/dashboards/recent')
  return body.dashboards || []
}

export async function trackDashboardAccess(id: string) {
  return api.post(`/dashboards/${id}/access`)
}

export async function markDashboardRead(id: string) {
  return api.post(`/dashboards/${id}/read`)
}

export async function searchUsers(query: string) {
  const body = await api.get<{ users: any[] }>(`/api/users/search?q=${encodeURIComponent(query)}`)
  return body.users || []
}

export async function inviteUserToDashboard(dashboardId: string, email: string) {
  return api.post(`/dashboards/${dashboardId}/share/invite`, { email })
}

export async function fetchDashboardPermissions(dashboardId: string) {
  return api.get<{ permissions: any[], currentUserRole?: string, owner?: any }>(`/dashboards/${dashboardId}/permissions`)
}

export async function removeDashboardPermission(dashboardId: string, email: string) {
  return api.delete(`/dashboards/${dashboardId}/permissions/${email}`)
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
  return api.post('/feedback', feedback)
}

export async function uploadFile(file: File, spaceId?: string | null, autoCreateConnection: boolean = false) {
  const formData = new FormData()
  formData.append('file', file)
  if (spaceId) formData.append('spaceId', spaceId)
  if (autoCreateConnection) formData.append('autoCreateConnection', 'true')
  return api.upload<any>('/upload', formData)
}

export async function uploadFileToConnection(file: File, connectionId: string, spaceId?: string | null) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('connectionId', connectionId)
  if (spaceId) formData.append('spaceId', spaceId)
  return api.upload<any>('/upload', formData)
}

export async function createCheckoutSession(priceId: string, tier?: string) {
  return api.post('/create-checkout-session', { priceId, tier })
}

export async function createTokenCheckoutSession(amount: number) {
  return api.post('/create-token-checkout-session', { amount })
}

export async function createStorageCheckoutSession(amount: number) {
  return api.post('/create-storage-checkout-session', { amount })
}

export async function createPortalSession() {
  return api.post('/create-portal-session')
}
export async function saveConnection(connection: any) {
  // Convert 'file' provider to 'duckdb' for backend compatibility and performance
  const connectionToSave = { ...connection }
  if (connectionToSave.provider === 'file') {
    connectionToSave.provider = 'duckdb'
  }

  console.log('[API] Saving connection:', connectionToSave)
  return api.post('/connections', connectionToSave)
}

export async function updateConnection(connection: any) {
  // Convert 'file' provider to 'duckdb' for backend compatibility and performance
  const connectionToSave = { ...connection }
  if (connectionToSave.provider === 'file') {
    connectionToSave.provider = 'duckdb'
  }

  return api.put(`/connections/${connection.id}`, connectionToSave)
}

export async function deleteConnection(id: string) {
  return api.delete(`/connections/${id}`)
}

export async function getSubscriptionStatus() {
  return api.get('/subscription-status')
}

export async function fetchPricingConfig() {
  return api.get<{ pro: string, pro_plus: string, storage: string }>('/api/config/plans')
}

export async function checkPaymentStatus(sessionId: string) {
  return api.get<{ status: string }>(`/api/payment/status/${sessionId}`)
}

export async function getUsageStats() {
  return api.get('/usage')
}

export async function syncSubscription() {
  return api.post('/sync-subscription')
}

export async function syncPayments() {
  return api.post('/sync-payments')
}

export async function getPayments() {
  return api.get<{ success: boolean, payments: any[] }>('/payments')
}


export async function uploadDashboardFile(dashboardId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return api.upload<any>(`/dashboards/${dashboardId}/files`, formData)
}

export function getFileDownloadUrl(fileId: string) {
  return `${QUERY_API_URL}/files/${fileId}`
}


const logBuffer: any[] = []
let flushTimer: any = null

const flushLogs = async () => {
  if (logBuffer.length === 0) return
  const batch = [...logBuffer]
  logBuffer.length = 0 // clear buffer

  try {
    await api.post('/operations/batch', { operations: batch })
  } catch (err) {
    console.warn('[API] Failed to flush logs', err)
    // Optionally re-queue failed logs? For lightweight audit, maybe drop them to avoid deadlock logic.
  }
}

export async function logOperationToBackend(data: any) {
  logBuffer.push({ ...data, timestamp: Date.now() })

  if (!flushTimer) {
    flushTimer = setInterval(() => {
      if (logBuffer.length > 0) flushLogs()
    }, 5000) // Flush every 5 seconds
  }

  // Also flush immediately if buffer gets too big
  if (logBuffer.length >= 20) {
    flushLogs()
  }
}

export async function fetchOperationHistory(limit = 50) {
  return api.get(`/operations/history?limit=${limit}`)
}

export async function fetchOperationAnalytics(range = 'day') {
  return api.get(`/operations/analytics?range=${range}`)
}

export async function renameTable(connection: ConnectionEntry, table: string, newName: string) {
  const payload = buildConnectionPayload(connection)
  return api.post('/api/rename-table', {
    connection: payload,
    oldTableName: table,
    newTableName: newName,
    provider: connection.provider
  })
}

export async function deleteTable(connection: ConnectionEntry, table: string) {
  const payload = buildConnectionPayload(connection)
  return api.post('/api/delete-table', {
    connection: payload,
    tableName: table,
    provider: connection.provider
  })
}

export async function fetchDatabaseTables(connection: ConnectionEntry, dbName: string) {
  const payload = buildConnectionPayload(connection, { database: dbName })
  const schema = await api.post<any>('/schema', {
    provider: connection.provider,
    connection: payload,
  })
  return (schema.tables || []) as string[]
}

export async function runQuery(connection: ConnectionEntry, query: string) {
  const payload = buildConnectionPayload(connection)
  const start = Date.now()

  try {
    const res = await api.post<any>('/query', {
      provider: connection.provider,
      connection: payload,
      query,
    })

    const duration = Date.now() - start
    // Notify if > 10s and backgrounded
    if (duration > 10000 && typeof document !== 'undefined' && document.hidden) {
      sendDesktopNotification('Query Completed', `Query took ${(duration / 1000).toFixed(1)}s`)
    }
    return res
  } catch (e) {
    throw e
  }
}

export async function fetchTableQuery(connection: any, tableName: string, limit = 100, offset = 0) {
  const payload = buildConnectionPayload(connection)
  // Try multiple sources for provider:
  // 1. connection.provider (if it's a ConnectionEntry)
  // 2. payload.provider (if buildConnectionPayload added it)
  // 3. Default to 'duckdb' for uploaded files (faster than sqlite)
  let provider = connection.provider || payload.provider || 'duckdb'

  // Convert 'file' provider to 'duckdb' for backend compatibility and performance
  if (provider === 'file') {
    provider = 'duckdb'
  }

  console.log('[API] fetchTableQuery:', { tableName, provider, originalProvider: connection.provider, hasConnectionProvider: !!connection.provider, hasPayloadProvider: !!payload.provider })

  return api.post(`/api/table/${tableName}/query`, {
    connection: payload,
    provider,
    limit,
    offset
  })
}

export async function fetchTableSchema(connection: any, tableName: string) {
  const payload = buildConnectionPayload(connection)
  // Try multiple sources for provider:
  // 1. connection.provider (if it's a ConnectionEntry)
  // 2. payload.provider (if buildConnectionPayload added it)
  // 3. Default to 'duckdb' for uploaded files (faster than sqlite)
  let provider = connection.provider || payload.provider || 'duckdb'

  // Convert 'file' provider to 'duckdb' for backend compatibility and performance
  if (provider === 'file') {
    provider = 'duckdb'
  }

  console.log('[API] fetchTableSchema:', { tableName, provider, originalProvider: connection.provider, hasConnectionProvider: !!connection.provider, hasPayloadProvider: !!payload.provider })

  return api.post(`/api/table/${tableName}/schema`, {
    connection: payload,
    provider
  })
}

export async function saveTableData(tableName: string, updates: any[], deletedRowIds: any[], deletedColumns: any[], connection: any) {
  const payload = buildConnectionPayload(connection)
  return api.post('/api/save-table-data', {
    tableName,
    updates,
    deletedRowIds,
    deletedColumns,
    connection: payload,
    provider: connection.provider
  })
}
export async function fetchSpaces() {
  const body = await api.get<{ spaces: any[] }>('/spaces')
  return body.spaces || []
}

export async function createSpace(name: string, description?: string, icon?: string, color?: string, tags?: string[]) {
  return api.post<{ id: string }>('/spaces', { name, description, icon, color, tags })
}

export async function updateSpace(id: string, updates: any) {
  return api.put(`/spaces/${id}`, updates)
}

export async function deleteSpace(id: string) {
  return api.delete(`/spaces/${id}`)
}

export async function fetchSpacePermissions(spaceId: string) {
  return api.get<{ permissions: any[], currentUserRole?: string, owner?: any }>(`/spaces/${spaceId}/permissions`)
}

export async function inviteUserToSpace(spaceId: string, email: string, role: string = 'read') {
  return api.post(`/spaces/${spaceId}/share/invite`, { email, role })
}

export async function removeSpacePermission(spaceId: string, email: string) {
  return api.delete(`/spaces/${spaceId}/permissions/${email}`)
}

export async function fetchSpaceSources(spaceId: string) {
  const body = await api.get<{ sources: any[] }>(`/spaces/${spaceId}/sources`)
  return body.sources || []
}

export async function fetchSpaceFiles(spaceId: string) {
  const body = await api.get<{ files: any[] }>(`/spaces/${spaceId}/files`)
  return body.files || []
}

export async function createSpaceFile(spaceId: string, fileData: any) {
  return api.post(`/spaces/${spaceId}/files`, fileData)
}

export async function fetchSpaceNotes(spaceId: string) {
  const body = await api.get<{ notes: any[] }>(`/spaces/${spaceId}/notes`)
  return body.notes || []
}

export async function createSpaceNote(spaceId: string, noteData: any) {
  return api.post(`/spaces/${spaceId}/notes`, noteData)
}

export async function updateSpaceNote(noteId: string, updates: any) {
  return api.put(`/spaces/notes/${noteId}`, updates)
}

export async function deleteSpaceFile(fileId: string) {
  return api.delete(`/spaces/files/${fileId}`)
}

export async function deleteSpaceNote(noteId: string) {
  return api.delete(`/spaces/notes/${noteId}`)
}
