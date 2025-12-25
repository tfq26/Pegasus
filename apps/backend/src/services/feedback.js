import { sql } from '../db/neon.js'

const CRITICAL_KEYWORDS = [
  'crash', 'error', 'broken', 'not working', 'data loss',
  'security', 'vulnerability', 'hack', 'breach',
  'urgent', 'critical', 'emergency',
  "can't login", "can't access", "cannot login", "cannot access"
]

export function detectPriority(description, isUrgent) {
  if (isUrgent) return 'critical'

  const lowerDesc = description.toLowerCase()
  const hasCriticalKeyword = CRITICAL_KEYWORDS.some(keyword =>
    lowerDesc.includes(keyword.toLowerCase())
  )

  if (hasCriticalKeyword) return 'critical'
  return 'normal'
}


export async function createFeedback(data) {
  const db = sql
  if (!db) throw new Error("Neon database connection not configured")

  const priority = detectPriority(data.description, data.isUrgent)

  const result = await db`
    INSERT INTO feedback (
      user_email,
      feature_category,
      custom_feature,
      issue_type,
      priority,
      description,
      browser_info,
      is_urgent
    ) VALUES (
      ${data.userEmail || null},
      ${data.featureCategory},
      ${data.customFeature || null},
      ${data.issueType},
      ${priority},
      ${data.description},
      ${data.browserInfo || null},
      ${data.isUrgent}
    )
    RETURNING *
  `

  return { feedback: result[0], priority }
}

export async function getUnnotifiedFeedback() {
  const db = sql
  if (!db) return []

  return await db`
    SELECT * FROM feedback
    WHERE notified = false
    ORDER BY created_at DESC
  `
}

export async function markAsNotified(ids) {
  if (ids.length === 0) return
  const db = sql
  if (!db) return

  await db`
    UPDATE feedback
    SET notified = true
    WHERE id = ANY(${ids})
  `
}
