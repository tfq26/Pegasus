// Experimental Features Management
// This module handles experimental feature flags and access control

export const EXPERIMENTAL_FEATURES = {
    MANUAL_EXCEL_FORMULAS: {
        id: 'manual-excel-formulas',
        name: 'Manual Excel Formulas',
        description: 'Enable Excel-style formula bar with autocomplete, point mode, and advanced formula features',
        category: 'spreadsheet',
        defaultEnabled: false
    },
    ADVANCED_AI_MODES: {
        id: 'advanced-ai-modes',
        name: 'Advanced AI Modes',
        description: 'Access to experimental AI features and models',
        category: 'ai',
        defaultEnabled: false
    },
    QUERY_PERFORMANCE_INSIGHTS: {
        id: 'query-performance-insights',
        name: 'Query Performance Insights',
        description: 'Detailed query execution plans and performance metrics',
        category: 'query',
        defaultEnabled: false
    }
}

// Initialize experimental features tables
export async function initExperimentalTables(db) {
    // Experimental access requests table
    await db.execute(`
    CREATE TABLE IF NOT EXISTS experimental_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      email TEXT,
      status TEXT DEFAULT 'pending',
      requested_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

    // Experimental access grants table
    await db.execute(`
    CREATE TABLE IF NOT EXISTS experimental_access (
      user_id TEXT PRIMARY KEY,
      has_access INTEGER DEFAULT 0,
      granted_at INTEGER,
      granted_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

    // User feature flags table (overrides)
    await db.execute(`
    CREATE TABLE IF NOT EXISTS user_feature_flags (
      user_id TEXT NOT NULL,
      feature_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 0,
      enabled_at INTEGER,
      PRIMARY KEY (user_id, feature_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

    console.log('✅ Experimental features tables initialized')
}

// Get user's experimental status
export async function getExperimentalStatus(db, userId) {
    // Check if user has experimental access
    const accessRs = await db.execute({
        sql: 'SELECT has_access, granted_at FROM experimental_access WHERE user_id = ?',
        args: [userId]
    })

    const hasAccess = accessRs.rows.length > 0 && accessRs.rows[0].has_access === 1

    // Check if user has a pending request
    const requestRs = await db.execute({
        sql: 'SELECT id, requested_at FROM experimental_requests WHERE user_id = ? AND status = ? ORDER BY requested_at DESC LIMIT 1',
        args: [userId, 'pending']
    })

    const requested = requestRs.rows.length > 0

    return {
        hasAccess,
        requested,
        requestedAt: requested ? requestRs.rows[0].requested_at : null
    }
}

// Get user's enabled feature flags
export async function getUserFeatureFlags(db, userId) {
    // Check if user has experimental access
    const status = await getExperimentalStatus(db, userId)

    if (!status.hasAccess) {
        return [] // No access = no experimental features
    }

    // Get user's enabled features
    const rs = await db.execute({
        sql: 'SELECT feature_id FROM user_feature_flags WHERE user_id = ? AND enabled = 1',
        args: [userId]
    })

    return rs.rows.map(row => row.feature_id)
}

// Create experimental access request
export async function createExperimentalRequest(db, userId, reason, email) {
    const id = crypto.randomUUID()
    const requestedAt = Date.now()

    await db.execute({
        sql: `
      INSERT INTO experimental_requests (id, user_id, reason, email, status, requested_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `,
        args: [id, userId, reason, email || null, requestedAt]
    })

    return { id, requestedAt }
}

// Grant experimental access (admin function)
export async function grantExperimentalAccess(db, userId, grantedBy) {
    const grantedAt = Date.now()

    // Grant access
    await db.execute({
        sql: `
      INSERT INTO experimental_access (user_id, has_access, granted_at, granted_by)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        has_access = 1,
        granted_at = excluded.granted_at,
        granted_by = excluded.granted_by
    `,
        args: [userId, grantedAt, grantedBy]
    })

    // Update any pending requests to approved
    await db.execute({
        sql: `
      UPDATE experimental_requests
      SET status = 'approved', reviewed_at = ?, reviewed_by = ?
      WHERE user_id = ? AND status = 'pending'
    `,
        args: [grantedAt, grantedBy, userId]
    })

    return { grantedAt }
}

// Toggle a feature flag for a user
export async function toggleUserFeature(db, userId, featureId, enabled) {
    const enabledAt = enabled ? Date.now() : null

    await db.execute({
        sql: `
      INSERT INTO user_feature_flags (user_id, feature_id, enabled, enabled_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, feature_id) DO UPDATE SET
        enabled = excluded.enabled,
        enabled_at = excluded.enabled_at
    `,
        args: [userId, featureId, enabled ? 1 : 0, enabledAt]
    })

    return { featureId, enabled, enabledAt }
}
