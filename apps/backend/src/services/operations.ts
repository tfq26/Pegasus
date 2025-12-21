import { sql } from '../db/neon.js'

export interface OperationLog {
  id: string
  label: string
  progress: number
  status: string
  details?: string
  error?: string
  started_at: string
  completed_at?: string
  duration?: number
  category?: string
  user_id?: string
  group_id?: string
}

export async function logOperation(data: OperationLog) {
  const db = sql
  if (!db) throw new Error("Neon database connection not configured")

  const result = await db`
    INSERT INTO operations (
      id,
      label,
      progress,
      status,
      details,
      error,
      started_at,
      completed_at,
      duration,
      category,
      user_id,
      group_id
    ) VALUES (
      ${data.id},
      ${data.label},
      ${data.progress},
      ${data.status},
      ${data.details || null},
      ${data.error || null},
      ${data.started_at},
      ${data.completed_at || null},
      ${data.duration || null},
      ${data.category || null},
      ${data.user_id || null},
      ${data.group_id || null}
    )
    ON CONFLICT (id) DO UPDATE SET
      progress = EXCLUDED.progress,
      status = EXCLUDED.status,
      details = EXCLUDED.details,
      error = EXCLUDED.error,
      completed_at = EXCLUDED.completed_at,
      duration = EXCLUDED.duration,
      category = EXCLUDED.category,
      group_id = EXCLUDED.group_id
    RETURNING *
  `

  return result[0]
}

export async function getUserOperations(userId: string, limit = 100) {
  const db = sql
  if (!db) return []

  return await db`
    SELECT * FROM operations
    WHERE user_id = ${userId}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `
}

export async function getOperationAnalytics(userId: string, range: 'day' | 'week' | 'month' | 'year' = 'day') {
  const db = sql
  if (!db) return null

  const stats = await db`
        SELECT 
            category,
            COUNT(*) as total_count,
            AVG(duration) as avg_duration,
            COUNT(*) FILTER (WHERE status = 'completed') as success_count,
            COUNT(*) FILTER (WHERE status = 'error') as error_count
        FROM operations
        WHERE user_id = ${userId}
        GROUP BY category
    `

  const overall = await db`
        SELECT 
            COUNT(*) as total_count,
            AVG(duration) as avg_duration,
            COUNT(*) FILTER (WHERE status = 'completed') as success_count,
            COUNT(*) FILTER (WHERE status = 'error') as error_count
        FROM operations
        WHERE user_id = ${userId}
    `

  let interval = '24 hours'
  let trunc = 'hour'

  if (range === 'week') { interval = '7 days'; trunc = 'day' }
  else if (range === 'month') { interval = '30 days'; trunc = 'day' }
  else if (range === 'year') { interval = '1 year'; trunc = 'month' }

  const usageHistory = await db`
        SELECT 
            date_trunc(${trunc}, started_at) as bucket,
            COUNT(*) as count
        FROM operations
        WHERE user_id = ${userId}
          AND started_at > NOW() - CAST(${interval} AS INTERVAL)
        GROUP BY bucket
        ORDER BY bucket ASC
    `

  return {
    byCategory: stats,
    overall: overall[0],
    usageHistory: usageHistory
  }
}
