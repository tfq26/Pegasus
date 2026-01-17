// Experimental Features Management
import { db } from './src/db/index.js';
import { users, experimentalRequests, experimentalAccess, userFeatureFlags } from './src/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const EXPERIMENTAL_FEATURES = {
    RAG_PIPELINE: {
        id: 'rag-pipeline',
        name: 'RAG Pipeline (Knowledge Base)',
        description: 'Enable Retrieval-Augmented Generation for grounded AI answers with citations from your documentation and database tables',
        category: 'ai',
        defaultEnabled: false
    },
    REAL_TIME_TOOLS: {
        id: 'real-time-tools',
        name: 'Real-time API Tools',
        description: 'Allow AI to call external APIs (Stocks, Weather, Custom) to get live information for inference',
        category: 'ai',
        defaultEnabled: false
    },
    MANUAL_EXCEL_FORMULAS: {
        id: 'manual-excel-formulas',
        name: 'Manual Excel Formulas',
        description: 'Enable direct entry of Excel-style formulas in spreadsheet cells with autocomplete and syntax highlighting',
        category: 'spreadsheet',
        defaultEnabled: false
    },
    ADVANCED_AI_MODES: {
        id: 'advanced-ai-modes',
        name: 'Advanced AI Modes',
        description: 'Experimental AI capabilities including iterative multi-step reasoning and autonomous data cleansing',
        category: 'ai',
        defaultEnabled: false
    },
    QUERY_PERFORMANCE_INSIGHTS: {
        id: 'query-performance-insights',
        name: 'Query Performance Insights',
        description: 'Detailed analysis of query execution plans and performance optimization suggestions',
        category: 'database',
        defaultEnabled: false
    }
}

// Initialize experimental tables
export async function initExperimentalTables(database) {
    // This function can be expanded to run migrations or seed data
    console.log('[Experimental] Tables initialized');
    return true;
}

export async function getExperimentalStatus(database, userId, jwtPayload = null) {
    try {
        // 1. Check WorkOS user metadata first
        if (jwtPayload && jwtPayload.experimental_access === true) {
            return {
                hasAccess: true,
                source: 'workos',
                requested: false,
                requestedAt: null
            };
        }

        // 1.1 Check subscription tier
        const userRec = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { subscriptionTier: true }
        });
        const tier = userRec?.subscriptionTier || 'free';

        if (tier === 'pro_plus') {
            return {
                hasAccess: true,
                source: 'tier_pro_plus',
                requested: false,
                requestedAt: null
            };
        }

        // 2. Fallback: Check Neon/Postgres for legacy/manual grants
        const access = await db.query.experimentalAccess.findFirst({
            where: and(eq(experimentalAccess.userId, userId), eq(experimentalAccess.hasAccess, true))
        });

        const hasAccess = !!access;

        // Check if user has a pending request
        const request = await db.query.experimentalRequests.findFirst({
            where: and(eq(experimentalRequests.userId, userId), eq(experimentalRequests.status, 'pending')),
            orderBy: [desc(experimentalRequests.requestedAt)]
        });

        const requested = !!request;

        return {
            hasAccess,
            source: hasAccess ? 'postgres' : null,
            requested,
            requestedAt: requested ? request.requestedAt : null
        }
    } catch (e) {
        console.error("Error getting experimental status:", e);
        return { hasAccess: false, requested: false, requestedAt: null };
    }
}

// Get user's enabled feature flags
export async function getUserFeatureFlags(database, userId) {
    const status = await getExperimentalStatus(database, userId)

    if (!status.hasAccess) {
        return []
    }

    try {
        const flags = await db.query.userFeatureFlags.findMany({
            where: and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.enabled, true)),
            columns: { featureId: true }
        });

        return flags.map(row => row.featureId)
    } catch (e) {
        console.error("Error getting feature flags:", e);
        return [];
    }
}

// Create experimental access request
export async function createExperimentalRequest(database, userId, reason, email) {
    try {
        const [created] = await db.insert(experimentalRequests)
            .values({
                userId,
                reason,
                email: email || null,
                status: 'pending',
                requestedAt: new Date()
            })
            .returning();

        return { id: created.id, requestedAt: created.requestedAt }
    } catch (e) {
        console.error("Error creating request:", e);
        throw e;
    }
}

// Grant experimental access (admin function)
export async function grantExperimentalAccess(database, userId, grantedBy) {
    const now = new Date();

    try {
        await db.transaction(async (tx) => {
            // 1. Upsert Access Record
            await tx.insert(experimentalAccess)
                .values({
                    userId,
                    hasAccess: true,
                    grantedAt: now,
                    grantedBy
                })
                .onConflictDoUpdate({
                    target: experimentalAccess.userId,
                    set: { hasAccess: true, grantedAt: now, grantedBy }
                });

            // 2. Approve Pending Requests
            await tx.update(experimentalRequests)
                .set({
                    status: 'approved',
                    reviewedAt: now,
                    reviewedBy: grantedBy
                })
                .where(and(eq(experimentalRequests.userId, userId), eq(experimentalRequests.status, 'pending')));
        });

        return { grantedAt: now }
    } catch (e) {
        console.error("Error granting access:", e);
        throw e;
    }
}

// Toggle a feature flag for a user
export async function toggleUserFeature(database, userId, featureId, enabled) {
    const now = new Date();

    try {
        // We use a combination of userId and featureId to identify the flag
        // In the schema, it's safer to use an upsert pattern if we had a composite unique key, 
        // but for now we'll handle it via insert with conflict or separate check.
        await db.insert(userFeatureFlags)
            .values({
                userId,
                featureId,
                enabled: !!enabled,
                enabledAt: now
            })
            .onConflictDoUpdate({
                target: [userFeatureFlags.userId, userFeatureFlags.featureId], // We should add this unique constraint
                set: { enabled: !!enabled, enabledAt: now }
            });

        return { featureId, enabled, enabledAt: now }
    } catch (e) {
        console.error("Error toggling feature:", e);
        throw e;
    }
}
