import { Surreal } from 'surrealdb';

const db = new Surreal();

const url = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
const user = process.env.SURREAL_USER || 'root';
const pass = process.env.SURREAL_PASS || 'root';
const ns = process.env.SURREAL_NS || 'test';
const dbName = process.env.SURREAL_DB || 'test';

let isConnected = false;

export const connectDB = async (retries = 5, delay = 2000) => {
    if (isConnected) return db;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`[SurrealDB] Connecting to ${url}... (Attempt ${i + 1}/${retries})`);

            // 1. Connect
            await db.connect(url);

            // 2. Signin
            await db.signin({ username: user, password: pass });

            // 3. Select DB
            await db.use({ namespace: ns, database: dbName });

            isConnected = true;
            console.log('[SurrealDB] Connected successfully');
            await initSchema();
            return db;
        } catch (e) {
            console.error(`[SurrealDB] Connection attempt ${i + 1} failed:`, e.message);
            if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
        }
    }
    console.error('[SurrealDB] Could not connect after multiple attempts.');
    return db;
};

// Initialize Schema & Permissions
const initSchema = async () => {
    try {
        // Users Table
        await db.query(`
            DEFINE TABLE user SCHEMALESS;
            DEFINE INDEX email ON TABLE user COLUMNS email UNIQUE;
        `);


        // Dashboards Table
        await db.query(`
            DEFINE TABLE dashboard SCHEMALESS;
            DEFINE FIELD title ON TABLE dashboard TYPE string;
            DEFINE FIELD owner ON TABLE dashboard TYPE record<user>;
            DEFINE FIELD is_public ON TABLE dashboard TYPE bool DEFAULT false;
            DEFINE FIELD cover_image ON TABLE dashboard TYPE string;
            DEFINE FIELD created_at ON TABLE dashboard TYPE datetime DEFAULT time::now();
            DEFINE FIELD updated_at ON TABLE dashboard TYPE datetime DEFAULT time::now();
        `);

        // Dashboard Elements (Granular)
        await db.query(`
            DEFINE TABLE dashboard_element SCHEMALESS;
            DEFINE FIELD dashboard ON TABLE dashboard_element TYPE record<dashboard>;
            DEFINE FIELD type ON TABLE dashboard_element TYPE string;
            DEFINE FIELD created_by ON TABLE dashboard_element TYPE record<user>;
            
            -- Permissions:
            -- Select: Public OR Owner OR Viewer/Editor
            -- Update/Delete: Owner OR (Editor AND Creator)
            -- Note: We will implement precise permission queries in the application layer first
            -- to ensure smooth migration, but we define the structure here.
        `);

        // Dashboard Permissions (Sharing)
        // We will simple use a 'permission' table linking user -> dashboard
        await db.query(`
            DEFINE TABLE dashboard_permission SCHEMALESS;
            DEFINE FIELD user ON TABLE dashboard_permission TYPE record<user>;
            DEFINE FIELD dashboard ON TABLE dashboard_permission TYPE record<dashboard>;
            DEFINE FIELD role ON TABLE dashboard_permission TYPE string; -- 'editor', 'viewer'
            DEFINE FIELD can_share ON TABLE dashboard_permission TYPE bool DEFAULT false;
            DEFINE FIELD can_download ON TABLE dashboard_permission TYPE bool DEFAULT false;
            
            DEFINE INDEX unique_access ON TABLE dashboard_permission COLUMNS user, dashboard UNIQUE;
        `);

        // Sanitization Metadata Table (Versioning)
        await db.query(`
            DEFINE TABLE sanitization_metadata SCHEMAFULL;
            DEFINE FIELD original_table ON sanitization_metadata TYPE string;
            DEFINE FIELD versions ON sanitization_metadata TYPE array; 
            DEFINE FIELD current_version ON sanitization_metadata TYPE number; 
            DEFINE FIELD upload_id ON sanitization_metadata TYPE string;
            
            DEFINE INDEX idx_original_table ON sanitization_metadata COLUMNS original_table UNIQUE;
        `);

        // Connection Workspaces (Persistence)
        await db.query(`
            DEFINE TABLE connection_workspace SCHEMALESS;
            DEFINE FIELD connection_id ON TABLE connection_workspace TYPE string;
            DEFINE FIELD user ON TABLE connection_workspace TYPE record<user>;
            DEFINE FIELD workspace_data ON TABLE connection_workspace TYPE object;
            DEFINE FIELD expires_at ON TABLE connection_workspace TYPE datetime;
            
            DEFINE INDEX idx_workspace_conn ON TABLE connection_workspace COLUMNS connection_id, user UNIQUE;
        `);

        console.log('[SurrealDB] Schema initialized');
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
