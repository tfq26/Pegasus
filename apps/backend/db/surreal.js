import { Surreal } from 'surrealdb';

const rawDb = new Surreal();

const rawUrl = (process.env.SURREAL_URL || 'ws://127.0.0.1:8000').trim();

const user = process.env.SURREAL_USER || 'root';
const pass = process.env.SURREAL_PASS || 'root';
const ns = process.env.SURREAL_NS || 'test';
const dbName = process.env.SURREAL_DB || 'test';

export let isConnected = false;
let lastConnectionCheck = 0;
let activeUrl = null; // Track the URL that worked

// Check if an error is related to token expiration
function isTokenExpiredError(error) {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('token has expired') ||
        message.includes('token expired') ||
        message.includes('authentication failed') ||
        message.includes('invalid token');
}

// Re-authenticate with the database (for when token expires)
async function reauthenticate() {
    console.log('[SurrealDB] Re-authenticating due to expired token...');
    try {
        await db.signin({ username: user, password: pass });
        await db.use({ namespace: ns, database: dbName });
        console.log('[SurrealDB] Re-authentication successful');
        lastConnectionCheck = Date.now();
        return true;
    } catch (e) {
        console.error('[SurrealDB] Re-authentication failed:', e.message);
        isConnected = false;
        throw e;
    }
}

// Ensure database connection is valid and authenticated
export async function ensureConnection() {
    const now = Date.now();
    const checkInterval = process.env.VERCEL === '1' ? 30000 : 60000; // 30s on Vercel, 60s elsewhere

    // If we recently checked and connection was valid, skip check
    if (isConnected && (now - lastConnectionCheck) < checkInterval) {
        return db;
    }

    // Try a lightweight health check
    try {
        await db.query('SELECT 1');
        isConnected = true;
        lastConnectionCheck = now;
        return db;
    } catch (e) {
        // Check if it's a token expiration error
        if (isTokenExpiredError(e)) {
            console.log('[SurrealDB] Token expired, attempting re-authentication...');
            try {
                await reauthenticate();
                return db;
            } catch (reauthError) {
                // Re-auth failed, need full reconnection
                console.log('[SurrealDB] Re-authentication failed, attempting full reconnection...');
                isConnected = false;
            }
        } else {
            console.error('[SurrealDB] Health check failed:', e.message);
            isConnected = false;
        }

        // If we get here, we need to reconnect
        return await connectDB();
    }
}

// Proxy wrapper to handle token expiration automatically
const db = new Proxy(rawDb, {
    get(target, prop) {
        const value = Reflect.get(target, prop);
        if (typeof value === 'function' && ['query', 'select', 'create', 'update', 'delete', 'patch', 'merge'].includes(prop)) {
            return async (...args) => {
                try {
                    return await value.apply(target, args);
                } catch (e) {
                    // Catch SurrealDB token expiration error
                    if (e.message && e.message.includes('token has expired')) {
                        console.warn(`[SurrealDB] Token expired during ${prop}. Attempting automatic re-signin...`);
                        try {
                            await target.signin({ username: user, password: pass });
                            await target.use({ namespace: ns, database: dbName });
                            console.log(`[SurrealDB] Re-signin successful. Retrying ${prop}...`);
                            // Retry the original operation once
                            return await target[prop](...args);
                        } catch (reauthErr) {
                            console.error('[SurrealDB] Automatic re-signin failed:', reauthErr.message);
                            throw e; // Throw the original expiry error if re-signin fails
                        }
                    }
                    throw e;
                }
            };
        }
        return value;
    }
});

// Proxy wrapper to handle token expiration automatically
const db = new Proxy(rawDb, {
    get(target, prop) {
        const value = Reflect.get(target, prop);
        if (typeof value === 'function' && ['query', 'select', 'create', 'update', 'delete', 'patch', 'merge'].includes(prop)) {
            return async (...args) => {
                try {
                    return await value.apply(target, args);
                } catch (e) {
                    // Catch SurrealDB token expiration error
                    if (e.message && e.message.includes('token has expired')) {
                        console.warn(`[SurrealDB] Token expired during ${prop}. Attempting automatic re-signin...`);
                        try {
                            await target.signin({ username: user, password: pass });
                            await target.use({ namespace: ns, database: dbName });
                            console.log(`[SurrealDB] Re-signin successful. Retrying ${prop}...`);
                            // Retry the original operation once
                            return await target[prop](...args);
                        } catch (reauthErr) {
                            console.error('[SurrealDB] Automatic re-signin failed:', reauthErr.message);
                            throw e; // Throw the original expiry error if re-signin fails
                        }
                    }
                    throw e;
                }
            };
        }
        return value;
    }
});

// Function to try connecting with a specific URL
async function tryConnect(targetUrl) {
    console.log(`[SurrealDB] Attempting connection to: ${targetUrl}`);
    // Create a new instance for each attempt to avoid sticky failed states
    const connectionDb = new Surreal();
    await connectionDb.connect(targetUrl);
    await connectionDb.signin({ username: user, password: pass });
    await connectionDb.use({ namespace: ns, database: dbName });
    return connectionDb;
}

export const connectDB = async (retries = process.env.VERCEL === '1' ? 1 : 5, delay = process.env.VERCEL === '1' ? 500 : 3000) => {
    if (isConnected) {
        try {
            await db.query('INFO FOR DB');
            return db;
        } catch (e) {
            isConnected = false;
        }
    }

    let lastError = null;

    // Prepare candidate URLs
    let base = rawUrl;
    if (base.endsWith('/rpc')) base = base.slice(0, -4);
    if (base.endsWith('/')) base = base.slice(0, -1);

    // Protocol variants
    const protocols = base.startsWith('ws') ? ['http', 'ws'] : ['http', 'ws'];
    const prefix = base.includes('://') ? base.split('://')[1] : base;
    const isSecure = base.startsWith('wss') || base.startsWith('https');

    const candidates = [];
    protocols.forEach(p => {
        const proto = isSecure ? (p === 'http' ? 'https' : 'wss') : p;
        candidates.push(`${proto}://${prefix}`);
        candidates.push(`${proto}://${prefix}/rpc`);
    });

    // Remove duplicates
    const uniqueCandidates = [...new Set(candidates)];

    for (let i = 0; i < retries; i++) {
        for (const candidate of uniqueCandidates) {
            try {
                console.log(`[SurrealDB] Connecting... (Attempt ${i + 1}/${retries}, URL: ${candidate})`);

                // We'll replace the global db instance with the successful one
                const resultDb = await tryConnect(candidate);

                // Copy connection state to global 'db' instance
                // In Surreal 1.x, we can't easily "swap" the internal socket, 
                // but we can re-connect the global one once we know which URL works.
                if (rawDb !== resultDb) {
                    await rawDb.connect(candidate);
                    await rawDb.signin({ username: user, password: pass });
                    await rawDb.use({ namespace: ns, database: dbName });
                }

                isConnected = true;
                activeUrl = candidate; // Track successful URL
                lastConnectionCheck = Date.now();
                console.log('[SurrealDB] Connected successfully');
                await initSchema();
                return db;
            } catch (e) {
                lastError = e;
                // Only log the first candidate failure in detail to avoid log spam, 
                // but log the final one if all fail.
                if (candidate === uniqueCandidates[uniqueCandidates.length - 1]) {
                    console.error(`[SurrealDB] All candidates failed for attempt ${i + 1}: ${e.message}`);
                }
            }
        }

        if (i < retries - 1) {
            console.log(`[SurrealDB] Waiting ${delay}ms before next retry batch...`);
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.error('[SurrealDB] Could not connect after multiple attempts.');
    if (lastError) {
        console.error('[SurrealDB] Last Error Message:', lastError.message);
        console.error('[SurrealDB] Last Error Stack:', lastError.stack);
    }
    throw lastError || new Error('Failed to connect to SurrealDB');
};

// Initialize Schema & Permissions
const initSchema = async () => {
    try {
        // Combined Schema Definition - running in a single batch to reduce round-trips
        await db.query(`
            -- Users Table
            DEFINE TABLE user SCHEMALESS
                PERMISSIONS 
                    FOR select, update WHERE id = $auth.id
                    FOR create, delete NONE;
            DEFINE FIELD email ON TABLE user TYPE string;
            DEFINE FIELD subscription_tier ON TABLE user TYPE string DEFAULT 'free';
            DEFINE FIELD purchased_tokens ON TABLE user TYPE number DEFAULT 0;
            DEFINE FIELD purchased_storage ON TABLE user TYPE number DEFAULT 0;
            DEFINE FIELD stripe_customer_id ON TABLE user TYPE string DEFAULT "";
            DEFINE INDEX email ON TABLE user COLUMNS email UNIQUE;

            -- Dashboards Table
            DEFINE TABLE dashboard SCHEMALESS
                PERMISSIONS
                    FOR select WHERE owner = $auth.id OR (SELECT id FROM dashboard_permission WHERE dashboard = $parent.id AND user = $auth.id)
                    FOR update, delete WHERE owner = $auth.id;
            DEFINE FIELD title ON TABLE dashboard TYPE string;
            DEFINE FIELD owner ON TABLE dashboard TYPE record<user>;
            DEFINE FIELD is_public ON TABLE dashboard TYPE bool DEFAULT false;
            DEFINE FIELD cover_image ON TABLE dashboard TYPE string;
            DEFINE FIELD created_at ON TABLE dashboard TYPE datetime DEFAULT time::now();
            DEFINE FIELD updated_at ON TABLE dashboard TYPE datetime DEFAULT time::now();
            DEFINE INDEX idx_owner ON TABLE dashboard COLUMNS owner;

            -- Dashboard Elements
            DEFINE TABLE dashboard_element SCHEMALESS
                PERMISSIONS
                    FOR select WHERE dashboard.owner = $auth.id OR (SELECT id FROM dashboard_permission WHERE dashboard = $parent.dashboard AND user = $auth.id)
                    FOR create FULL
                    FOR update, delete WHERE dashboard.owner = $auth.id OR (SELECT id FROM dashboard_permission WHERE dashboard = $parent.dashboard AND user = $auth.id AND role = 'editor');
            DEFINE FIELD dashboard ON TABLE dashboard_element TYPE record<dashboard>;
            DEFINE FIELD type ON TABLE dashboard_element TYPE string;
            DEFINE FIELD created_by ON TABLE dashboard_element TYPE record<user>;
            DEFINE INDEX idx_dashboard ON TABLE dashboard_element COLUMNS dashboard;

            -- Dashboard Permissions
            DEFINE TABLE dashboard_permission SCHEMALESS
                PERMISSIONS
                    FOR select WHERE user = $auth.id OR dashboard.owner = $auth.id
                    FOR create, update, delete WHERE dashboard.owner = $auth.id;
            DEFINE FIELD user ON TABLE dashboard_permission TYPE record<user>;
            DEFINE FIELD dashboard ON TABLE dashboard_permission TYPE record<dashboard>;
            DEFINE FIELD role ON TABLE dashboard_permission TYPE string; 
            DEFINE FIELD can_share ON TABLE dashboard_permission TYPE bool DEFAULT false;
            DEFINE FIELD can_download ON TABLE dashboard_permission TYPE bool DEFAULT false;
            DEFINE INDEX unique_access ON TABLE dashboard_permission COLUMNS user, dashboard UNIQUE;

            -- Spreadsheet Permissions
            DEFINE TABLE spreadsheet_permission SCHEMAFULL
                PERMISSIONS
                    FOR select WHERE user_email = $auth.email OR granted_by = $auth.id
                    FOR create, update, delete WHERE granted_by = $auth.id;
            DEFINE FIELD spreadsheet ON TABLE spreadsheet_permission TYPE string;
            DEFINE FIELD user_email ON TABLE spreadsheet_permission TYPE string;
            DEFINE FIELD access_level ON TABLE spreadsheet_permission TYPE string;
            DEFINE FIELD granted_by ON TABLE spreadsheet_permission TYPE record<user>;
            DEFINE FIELD granted_at ON TABLE spreadsheet_permission TYPE datetime DEFAULT time::now();
            DEFINE INDEX unique_ss_access ON TABLE spreadsheet_permission COLUMNS spreadsheet, user_email UNIQUE;

            -- Sanitization Metadata
            DEFINE TABLE sanitization_metadata SCHEMAFULL
                PERMISSIONS
                    FOR select WHERE (SELECT id FROM uploads WHERE id = $parent.upload_id AND user_id = $auth.id)
                    FOR create, update, delete NONE;
            DEFINE FIELD original_table ON sanitization_metadata TYPE string;
            DEFINE FIELD versions ON sanitization_metadata TYPE array; 
            DEFINE FIELD current_version ON sanitization_metadata TYPE number; 
            DEFINE FIELD upload_id ON sanitization_metadata TYPE string;
            DEFINE INDEX idx_original_table ON sanitization_metadata COLUMNS original_table UNIQUE;

            -- Connection Workspaces (simplified - no expiration needed)
            DEFINE TABLE connection_workspace SCHEMALESS
                PERMISSIONS
                    FOR select, update, delete WHERE user = $auth.id
                    FOR create WHERE user = $auth.id;
            DEFINE FIELD connection_id ON TABLE connection_workspace TYPE string;
            DEFINE FIELD user ON TABLE connection_workspace TYPE record<user>;
            DEFINE FIELD workspace_data ON TABLE connection_workspace TYPE object;
            DEFINE INDEX idx_workspace_conn ON TABLE connection_workspace COLUMNS connection_id, user UNIQUE;

            -- Knowledge Base (Vector Store)
            DEFINE TABLE knowledge_chunk SCHEMAFULL
                PERMISSIONS
                    FOR select, update, delete WHERE user = $auth.id
                    FOR create WHERE user = $auth.id;
            DEFINE FIELD content ON TABLE knowledge_chunk TYPE string;
            DEFINE FIELD embedding ON TABLE knowledge_chunk TYPE array<number>;
            DEFINE FIELD metadata ON TABLE knowledge_chunk TYPE object;
            DEFINE FIELD user ON TABLE knowledge_chunk TYPE record<user>;
            DEFINE FIELD created_at ON TABLE knowledge_chunk TYPE datetime DEFAULT time::now();
            DEFINE INDEX idx_vector ON TABLE knowledge_chunk FIELDS embedding MTREE DIMENSION 1536;
            DEFINE ANALYZER rag_analyzer TOKENIZERS blank,class,camel,punct FILTERS lowercase,ascii;
            DEFINE INDEX idx_content ON TABLE knowledge_chunk FIELDS content SEARCH ANALYZER rag_analyzer BM25;

            -- User Secrets
            DEFINE TABLE user_secret SCHEMALESS
                PERMISSIONS
                    FOR select, update, delete WHERE user = $auth.id
                    FOR create WHERE user = $auth.id;
            DEFINE FIELD user ON TABLE user_secret TYPE record<user>;
            DEFINE FIELD name ON TABLE user_secret TYPE string;
            DEFINE FIELD value ON TABLE user_secret TYPE string;
            DEFINE FIELD created_at ON TABLE user_secret TYPE datetime DEFAULT time::now();
            DEFINE INDEX idx_user_secret ON TABLE user_secret COLUMNS user, name UNIQUE;

            -- Transaction Tracking
            DEFINE TABLE transaction_master SCHEMALESS
                PERMISSIONS 
                    FOR select, create, update, delete NONE;
            DEFINE INDEX idx_stripe_session ON TABLE transaction_master COLUMNS stripe_session_id UNIQUE;

            -- User Payment History
            DEFINE TABLE user_payment SCHEMAFULL
                PERMISSIONS 
                    FOR select WHERE user = $auth.id
                    FOR create, update, delete NONE;
            DEFINE FIELD user ON TABLE user_payment TYPE record<user>;
            DEFINE FIELD amount ON TABLE user_payment TYPE number;
            DEFINE FIELD currency ON TABLE user_payment TYPE string;
            DEFINE FIELD tokens ON TABLE user_payment TYPE number DEFAULT 0;
            DEFINE FIELD storage_bytes ON TABLE user_payment TYPE number DEFAULT 0;
            DEFINE FIELD status ON TABLE user_payment TYPE string;
            DEFINE FIELD description ON TABLE user_payment TYPE string;
            DEFINE FIELD stripe_session_id ON TABLE user_payment TYPE string;
            DEFINE FIELD created_at ON TABLE user_payment TYPE datetime DEFAULT time::now();
        `);

        console.log('[SurrealDB] Schema initialized (Batch Mode)');
    } catch (e) {
        // Ignore "table already exists" errors
        if (e.message && e.message.includes('already exists')) {
            // console.log('[SurrealDB] Schema already exists');
        } else {
            console.error('[SurrealDB] Schema initialization warning:', e);
        }
    }
}

export { db };
