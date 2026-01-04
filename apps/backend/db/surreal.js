import { Surreal } from 'surrealdb';

const db = new Surreal();

const url = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
const user = process.env.SURREAL_USER || 'root';
const pass = process.env.SURREAL_PASS || 'root';
const ns = process.env.SURREAL_NS || 'test';
const dbName = process.env.SURREAL_DB || 'test';

export let isConnected = false;

export const connectDB = async (retries = process.env.VERCEL === '1' ? 1 : 5, delay = process.env.VERCEL === '1' ? 500 : 2000) => {
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
            
            DEFINE INDEX idx_owner ON TABLE dashboard COLUMNS owner;
        `);

        // Dashboard Elements (Granular)
        await db.query(`
            DEFINE TABLE dashboard_element SCHEMALESS;
            DEFINE FIELD dashboard ON TABLE dashboard_element TYPE record<dashboard>;
            DEFINE FIELD type ON TABLE dashboard_element TYPE string;
            DEFINE FIELD created_by ON TABLE dashboard_element TYPE record<user>;
            
            DEFINE INDEX idx_dashboard ON TABLE dashboard_element COLUMNS dashboard;
            
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

        // Spreadsheet Permissions (Sharing)
        // Allows sharing uploaded spreadsheets with View/Edit access
        await db.query(`
            DEFINE TABLE spreadsheet_permission SCHEMAFULL;
            DEFINE FIELD spreadsheet ON TABLE spreadsheet_permission TYPE string; -- table name (data_uuid_name)
            DEFINE FIELD user_email ON TABLE spreadsheet_permission TYPE string;
            DEFINE FIELD access_level ON TABLE spreadsheet_permission TYPE string; -- 'view' | 'edit'
            DEFINE FIELD granted_by ON TABLE spreadsheet_permission TYPE record<user>;
            DEFINE FIELD granted_at ON TABLE spreadsheet_permission TYPE datetime DEFAULT time::now();
            
            DEFINE INDEX unique_ss_access ON TABLE spreadsheet_permission COLUMNS spreadsheet, user_email UNIQUE;
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

        // Knowledge Base for RAG
        await db.query(`
            DEFINE TABLE knowledge_chunk SCHEMAFULL;
            DEFINE FIELD content ON TABLE knowledge_chunk TYPE string;
            DEFINE FIELD embedding ON TABLE knowledge_chunk TYPE array<number>;
            DEFINE FIELD metadata ON TABLE knowledge_chunk TYPE object;
            DEFINE FIELD user ON TABLE knowledge_chunk TYPE record<user>;
            DEFINE FIELD created_at ON TABLE knowledge_chunk TYPE datetime DEFAULT time::now();

            -- Vector Index for Semantic Search (MTREE)
            -- Note: We use 1536 as a safe default for OpenAI, 
            -- Gemini (768) will still work but might be less efficient with 1536 padding.
            DEFINE INDEX idx_vector ON TABLE knowledge_chunk FIELDS embedding MTREE DIMENSION 1536;

            -- Full-Text Index for Keyword Search
            DEFINE ANALYZER rag_analyzer TOKENIZERS blank,class,camel,punct FILTERS lowercase,ascii;
            DEFINE INDEX idx_content ON TABLE knowledge_chunk FIELDS content SEARCH ANALYZER rag_analyzer BM25;
        `);

        // User Secrets Table (Secure storage for API keys, etc)
        await db.query(`
            DEFINE TABLE user_secret SCHEMALESS;
            DEFINE FIELD user ON TABLE user_secret TYPE record<user>;
            DEFINE FIELD name ON TABLE user_secret TYPE string;
            DEFINE FIELD value ON TABLE user_secret TYPE string; -- Should ideally be encrypted
            DEFINE FIELD created_at ON TABLE user_secret TYPE datetime DEFAULT time::now();
            
            DEFINE INDEX idx_user_secret ON TABLE user_secret COLUMNS user, name UNIQUE;
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
