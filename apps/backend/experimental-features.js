// Experimental Features Management
// This module handles experimental feature flags and access control

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
    }
}

// Initialize experimental features tables
export async function initExperimentalTables(db) {
    // Define tables (Schema-less but good to declare)
    try {
        await db.query(`
            DEFINE TABLE experimental_request SCHEMALESS;
            DEFINE TABLE experimental_access SCHEMALESS;
            DEFINE TABLE user_feature_flag SCHEMALESS;
        `);
        console.log('✅ Experimental features tables initialized')
    } catch (e) {
        // Ignore "table already exists" errors which happen on restart
        if (e.message && e.message.includes('already exists')) {
            // console.log('Experimental tables already exist');
        } else {
            console.error('Failed to init experimental tables:', e);
        }
    }
}

// Get user's experimental status
// Checks WorkOS metadata first (set via WorkOS Dashboard), then falls back to SurrealDB
export async function getExperimentalStatus(db, userId, jwtPayload = null) {
    try {
        // 1. Check WorkOS user metadata first (managed via WorkOS Dashboard)
        if (jwtPayload && jwtPayload.experimental_access === true) {
            console.log(`[Experimental] Access granted via WorkOS metadata for user: ${userId}`);
            return {
                hasAccess: true,
                source: 'workos',
                requested: false,
                requestedAt: null
            };
        }

        // 1.1 Check SurrealDB for subscription tier (Pro+ gets automatic access)
        const userRec = `user:${userId}`;
        const [userData] = await db.query(`SELECT subscription_tier FROM ${userRec}`);
        const tier = userData && userData[0] ? userData[0].subscription_tier : 'free';

        if (tier === 'pro_plus') {
            return {
                hasAccess: true,
                source: 'tier_pro_plus',
                requested: false,
                requestedAt: null
            };
        }

        // 2. Fallback: Check SurrealDB for legacy/manual grants
        // Check if user has experimental access
        const [access] = await db.query(`
            SELECT has_access, granted_at FROM experimental_access 
            WHERE user = $user AND has_access = true LIMIT 1;
        `, {
            user: userRec
        });

        const hasAccess = !!(access && access[0]);

        // Check if user has a pending request
        const [request] = await db.query(`
            SELECT id, requested_at FROM experimental_request 
            WHERE user = $user AND status = 'pending' 
            ORDER BY requested_at DESC LIMIT 1;
        `, {
            user: userRec
        });

        const requested = !!(request && request[0]);

        return {
            hasAccess,
            source: hasAccess ? 'surrealdb' : null,
            requested,
            requestedAt: requested ? request[0].requested_at : null
        }
    } catch (e) {
        console.error("Error getting experimental status:", e);
        return { hasAccess: false, requested: false, requestedAt: null };
    }
}

// Get user's enabled feature flags
export async function getUserFeatureFlags(db, userId) {
    const status = await getExperimentalStatus(db, userId)

    if (!status.hasAccess) {
        return [] // No access = no experimental features
    }

    try {
        const userRec = `user:${userId}`;
        const [flags] = await db.query(`
            SELECT feature_id FROM user_feature_flag 
            WHERE user = $user AND enabled = true;
        `, {
            user: userRec
        });

        if (!flags) return [];
        return flags.map(row => row.feature_id)
    } catch (e) {
        console.error("Error getting feature flags:", e);
        return [];
    }
}

// Create experimental access request
export async function createExperimentalRequest(db, userId, reason, email) {
    const id = crypto.randomUUID()
    const requestedAt = Date.now()

    try {
        const userRec = `user:${userId}`;
        await db.query(`
            CREATE experimental_request CONTENT {
                user: $user,
                reason: $reason,
                email: $email,
                status: 'pending',
                requested_at: $requestedAt
            };
        `, {
            user: userRec,
            reason,
            email: email || null,
            requestedAt
        });

        return { id, requestedAt }
    } catch (e) {
        console.error("Error creating request:", e);
        throw e;
    }
}

// Grant experimental access (admin function)
export async function grantExperimentalAccess(db, userId, grantedBy) {
    const grantedAt = Date.now()
    const accessId = `experimental_access:${userId}`;
    const userRec = `user:${userId}`;

    try {
        // Transaction to update access and approve requests
        await db.query(`
            BEGIN TRANSACTION;

            -- 1. Upsert Access Record (Delete then Create to ensure state)
            DELETE type::thing('experimental_access', $userId);
            CREATE type::thing('experimental_access', $userId) CONTENT {
                user: $user,
                has_access: true,
                granted_at: $grantedAt,
                granted_by: $grantedBy
            };

            -- 2. Approve Pending Requests
            UPDATE experimental_request SET 
                status = 'approved', 
                reviewed_at = $reviewedAt, 
                reviewed_by = $reviewedBy
            WHERE user = $user AND status = 'pending';

            COMMIT TRANSACTION;
        `, {
            userId,
            user: userRec,
            grantedAt,
            grantedBy,
            reviewedAt: grantedAt,
            reviewedBy: grantedBy
        });

        return { grantedAt }
    } catch (e) {
        console.error("Error granting access:", e);
        throw e;
    }
}

// Toggle a feature flag for a user
export async function toggleUserFeature(db, userId, featureId, enabled) {
    const enabledAt = enabled ? Date.now() : null
    // Create a deterministic ID for the flag record: user_feature_flag:USERID_FEATUREID
    const recordId = `user_feature_flag:${userId}_${featureId}`;
    const userRec = `user:${userId}`;

    try {
        await db.query(`
            DELETE type::thing('user_feature_flag', $recordId);
            CREATE type::thing('user_feature_flag', $recordId) CONTENT {
                user: $user,
                feature_id: $featureId,
                enabled: $enabled,
                enabled_at: $enabledAt
            };
        `, {
            recordId: `${userId}_${featureId}`,
            user: userRec,
            featureId,
            enabled: !!enabled,
            enabledAt
        });

        return { featureId, enabled, enabledAt }
    } catch (e) {
        console.error("Error toggling feature:", e);
        throw e;
    }
}
