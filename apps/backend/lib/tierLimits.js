import { eq, sql, count, and } from "drizzle-orm";
import { connections, dashboards, users } from "../src/db/schema.js";

// Tier-based limits and validation
// Centralized configuration for subscription tier restrictions

export const TIER_LIMITS = {
    free: {
        connections: 4,
        tables: 20,
        dashboards: 1,
        models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gpt-5.1-mini'],
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
 * Check if user can create a new connection
 */
export async function canCreateConnection(db, userId, tier = 'free') {
    const limits = getTierLimits(tier)

    if (limits.connections === Infinity) {
        return { allowed: true }
    }

    const [result] = await db.select({ total: count() })
        .from(connections)
        .where(eq(connections.userId, userId));

    const current = result?.total || 0

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
 * Get tier limits for a given subscription tier
 */
export function getTierLimits(tier = 'free') {
    return TIER_LIMITS[tier] || TIER_LIMITS.free
}

/**
 * Count total tables across all user connections
 */
export async function countUserTables(db, userId) {
    // We count tables that match the pattern data_{uuid}_{name}
    // and also check connection count as a proxy.
    // For Neon, we can query information_schema.tables to count physical tables 
    // that belong to this user's uploads.

    try {
        // For Neon HTTP driver, we need to use raw SQL differently
        // Use a simple SELECT with drizzle to get the count
        const result = await db.execute(sql`
            SELECT count(*)::int as total 
            FROM information_schema.tables 
            WHERE table_name LIKE 'data_%'
        `);

        return Number(result.rows?.[0]?.total || result[0]?.total || 0);
    } catch (e) {
        console.error('[countUserTables] Error:', e);
        return 0;
    }
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

    const [result] = await db.select({ total: count() })
        .from(dashboards)
        .where(eq(dashboards.ownerId, userId));

    const current = result?.total || 0

    return {
        allowed: current < limits.dashboards,
        current,
        limit: limits.dashboards,
        message: current >= limits.dashboards
            ? `You've reached the ${tier} limit of ${limits.dashboards} dashboard${limits.dashboards > 1 ? 's' : ''}. Upgrade to ${tier === 'free' ? 'Pro' : 'Pro+'} for ${tier === 'free' ? '10 dashboards' : 'unlimited dashboards'}.`
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

    const [connectionResult] = await db.select({ total: count() })
        .from(connections)
        .where(eq(connections.userId, userId));

    const [dashboardResult] = await db.select({ total: count() })
        .from(dashboards)
        .where(eq(dashboards.ownerId, userId));

    const tableCount = await countUserTables(db, userId)

    const cTotal = connectionResult?.total || 0;
    const dTotal = dashboardResult?.total || 0;

    return {
        connections: {
            current: cTotal,
            limit: limits.connections,
            percentage: limits.connections === Infinity ? 0 : Math.round(cTotal / limits.connections * 100)
        },
        tables: {
            current: tableCount,
            limit: limits.tables,
            percentage: limits.tables === Infinity ? 0 : Math.round(tableCount / limits.tables * 100)
        },
        dashboards: {
            current: dTotal,
            limit: limits.dashboards,
            percentage: limits.dashboards === Infinity ? 0 : Math.round(dTotal / limits.dashboards * 100)
        }
    }
}

/**
 * Calculate total user limits (tokens & storage) including purchased add-ons
 * @param {Object} db - Database instance
 * @param {String} userId - User ID
 */
export async function calculateUserLimits(db, userId) {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
    });

    const tier = user?.subscriptionTier || 'free';
    const purchasedTokens = user?.purchasedTokens || 0;
    const purchasedStorage = user?.purchasedStorage || 0;

    const limits = getTierLimits(tier);

    const baseTokenLimit = limits.tokens;
    const baseStorageLimit = limits.storage;

    const tokenLimit = baseTokenLimit + purchasedTokens;
    const storageLimit = baseStorageLimit + purchasedStorage;

    return {
        tier,
        tokenLimit,
        storageLimit,
        purchasedTokens,
        purchasedStorage,
        baseTokenLimit,
        baseStorageLimit,
        storageUsed: user?.storageUsed || 0,
        storageProvider: user?.storageProvider || 'system'
    };
}

/**
 * Check if user can upload file (Storage Quota)
 */
export async function canUploadFile(db, userId, fileSizeBytes) {
    const limits = await calculateUserLimits(db, userId);

    if (limits.storageLimit === -1) { // If infinite was represented as -1, but here huge number is better or check tier
        // Pro Plus might be infinite?
        // In TIER_LIMITS pro_plus is 10GB, so not infinite.
        // If we want infinite, we'd handle it here.
    }

    const projectedUsage = (limits.storageUsed || 0) + fileSizeBytes;

    return {
        allowed: projectedUsage <= limits.storageLimit,
        current: limits.storageUsed,
        limit: limits.storageLimit,
        projected: projectedUsage,
        message: projectedUsage > limits.storageLimit
            ? `Upload failed. This file (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB) would exceed your storage limit of ${(limits.storageLimit / 1024 / 1024).toFixed(0)} MB.`
            : null
    };
}
