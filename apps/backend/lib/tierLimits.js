// Tier-based limits and validation
// Centralized configuration for subscription tier restrictions

export const TIER_LIMITS = {
    free: {
        connections: 4,
        tables: 20,
        dashboards: 1,
        models: ['gemini-2.5-flash-lite', 'gpt-5.1-mini'],
        storage: 100 * 1024 * 1024, // 100 MB
        tokens: 60000
    },
    pro: {
        connections: Infinity,
        tables: Infinity,
        dashboards: 10,
        models: [
            'gemini-3-flash-preview',
            'gemini-3-pro-preview',
            'gpt-5.1-mini',
            'gpt-5.1',
            'o4-mini',
            'claude-3-5-haiku-latest',
            'claude-3-5-sonnet-latest'
        ],
        storage: 500 * 1024 * 1024, // 500 MB
        tokens: 200000
    },
    pro_plus: {
        connections: Infinity,
        tables: Infinity,
        dashboards: Infinity,
        models: null, // null = all models allowed
        storage: 10 * 1024 * 1024 * 1024, // 10 GB
        tokens: 600000
    }
}

/**
 * Get tier limits for a given subscription tier
 */
export function getTierLimits(tier = 'free') {
    return TIER_LIMITS[tier] || TIER_LIMITS.free
}

/**
 * Check if user can create a new connection
 */
export async function canCreateConnection(db, userId, tier = 'free') {
    const limits = getTierLimits(tier)

    if (limits.connections === Infinity) {
        return { allowed: true }
    }

    const [result] = await db.query(`
    SELECT count() as total FROM connection WHERE user = type::thing('user', $userId)
  `, { userId })

    const current = result?.[0]?.total || 0

    return {
        allowed: current < limits.connections,
        current,
        limit: limits.connections,
        message: current >= limits.connections
            ? `You've reached the ${tier} tier limit of ${limits.connections} connections. Upgrade to Pro for unlimited connections.`
            : null
    }
}

/**
 * Count total tables across all user connections
 */
export async function countUserTables(db, userId) {
    const [connections] = await db.query(`
    SELECT id FROM connection WHERE user = type::thing('user', $userId)
  `, { userId })

    if (!connections || connections.length === 0) {
        return 0
    }

    let totalTables = 0
    for (const conn of connections) {
        const [tables] = await db.query(`
      SELECT tables FROM ${conn.id}
    `)
        if (tables?.[0]?.tables) {
            totalTables += tables[0].tables.length
        }
    }

    return totalTables
}

/**
 * Check if user can add more tables (when creating/updating connection)
 */
export async function canAddTables(db, userId, tier = 'free', newTableCount = 0) {
    const limits = getTierLimits(tier)

    if (limits.tables === Infinity) {
        return { allowed: true }
    }

    const currentTables = await countUserTables(db, userId)
    const projectedTotal = currentTables + newTableCount

    return {
        allowed: projectedTotal <= limits.tables,
        current: currentTables,
        limit: limits.tables,
        projected: projectedTotal,
        message: projectedTotal > limits.tables
            ? `This connection would bring your total to ${projectedTotal} tables, exceeding the ${tier} tier limit of ${limits.tables}. Upgrade to Pro for unlimited tables.`
            : null
    }
}

/**
 * Check if user can create a new dashboard
 */
export async function canCreateDashboard(db, userId, tier = 'free') {
    const limits = getTierLimits(tier)

    if (limits.dashboards === Infinity) {
        return { allowed: true }
    }

    const [result] = await db.query(`
    SELECT count() as total FROM dashboard 
    WHERE owner = type::thing('user', $userId)
  `, { userId })

    const current = result?.[0]?.total || 0

    return {
        allowed: current < limits.dashboards,
        current,
        limit: limits.dashboards,
        message: current >= limits.dashboards
            ? `You've reached the ${tier} tier limit of ${limits.dashboards} dashboard${limits.dashboards > 1 ? 's' : ''}. Upgrade to ${tier === 'free' ? 'Pro' : 'Pro+'} for ${tier === 'free' ? '10 dashboards' : 'unlimited dashboards'}.`
            : null
    }
}

/**
 * Filter AI models based on tier
 */
export function filterModelsByTier(allModels, tier = 'free') {
    const limits = getTierLimits(tier)

    // Pro+ gets all models
    if (limits.models === null) {
        return allModels
    }

    // Filter to allowed models
    return allModels.filter(model => limits.models.includes(model.id))
}

/**
 * Check if a specific model is allowed for tier
 */
export function isModelAllowed(modelId, tier = 'free') {
    const limits = getTierLimits(tier)

    if (limits.models === null) {
        return true
    }

    return limits.models.includes(modelId)
}

/**
 * Get usage summary for a user
 */
export async function getUserUsageSummary(db, userId, tier = 'free') {
    const limits = getTierLimits(tier)

    const [connectionCount] = await db.query(`
    SELECT count() as total FROM connection WHERE user = type::thing('user', $userId)
  `, { userId })

    const [dashboardCount] = await db.query(`
    SELECT count() as total FROM dashboard WHERE owner = type::thing('user', $userId)
  `, { userId })

    const tableCount = await countUserTables(db, userId)

    return {
        connections: {
            current: connectionCount?.[0]?.total || 0,
            limit: limits.connections,
            percentage: limits.connections === Infinity ? 0 : Math.round((connectionCount?.[0]?.total || 0) / limits.connections * 100)
        },
        tables: {
            current: tableCount,
            limit: limits.tables,
            percentage: limits.tables === Infinity ? 0 : Math.round(tableCount / limits.tables * 100)
        },
        dashboards: {
            current: dashboardCount?.[0]?.total || 0,
            limit: limits.dashboards,
            percentage: limits.dashboards === Infinity ? 0 : Math.round((dashboardCount?.[0]?.total || 0) / limits.dashboards * 100)
        }
    }
}
