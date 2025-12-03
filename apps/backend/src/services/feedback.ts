import { sql } from '../db/neon.js'

const CRITICAL_KEYWORDS = [
    'crash', 'error', 'broken', 'not working', 'data loss',
    'security', 'vulnerability', 'hack', 'breach',
    'urgent', 'critical', 'emergency',
    "can't login", "can't access", "cannot login", "cannot access"
]

export interface FeedbackData {
    userEmail?: string
    featureCategory: string
    customFeature?: string
    issueType: string
    description: string
    browserInfo?: string
    isUrgent: boolean
}

export function detectPriority(description: string, isUrgent: boolean): string {
    if (isUrgent) return 'critical'

    const lowerDesc = description.toLowerCase()
    const hasCriticalKeyword = CRITICAL_KEYWORDS.some(keyword =>
        lowerDesc.includes(keyword.toLowerCase())
    )

    if (hasCriticalKeyword) return 'critical'
    return 'normal'
}

export async function createFeedback(data: FeedbackData) {
    const priority = detectPriority(data.description, data.isUrgent)

    const result = await sql`
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
    return await sql`
    SELECT * FROM feedback
    WHERE notified = false
    ORDER BY created_at DESC
  `
}

export async function markAsNotified(ids: number[]) {
    if (ids.length === 0) return

    await sql`
    UPDATE feedback
    SET notified = true
    WHERE id = ANY(${ids})
  `
}
