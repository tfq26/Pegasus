
import { createClient } from "@libsql/client";
import { Surreal } from "surrealdb";

// Bun automatically loads .env files
// import dotenv from "dotenv";
// dotenv.config({ path: '../.env' }); 


// TURSO SETUP
const tursoUrl = process.env.TURSO_DB_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoAuthToken) {
    console.warn("TURSO credentials not found. Ensure TURSO_DB_URL and TURSO_AUTH_TOKEN are set.");
}

// Force usage of renamed DB file if local
let tUrl = tursoUrl;
if (!tUrl || tUrl.includes('pegasus.db')) {
    console.log("Using local backup DB: file:pegasus_old.db");
    tUrl = 'file:pegasus_old.db';
}

const turso = createClient({
    url: tUrl,
    authToken: tursoAuthToken,
});

// SURREAL SETUP
const surrealUrl = process.env.SURREAL_URL || 'ws://127.0.0.1:8000/rpc';
const surrealUser = process.env.SURREAL_USER || 'root';
const surrealPass = process.env.SURREAL_PASS || 'root';
const surrealNs = process.env.SURREAL_NS || 'test';
const surrealDb = process.env.SURREAL_DB || 'test';

const surreal = new Surreal();

async function main() {
    console.log("🚀 Starting Migration...");

    try {
        console.log("Connecting...");
        await surreal.connect(surrealUrl);
        console.log("Signing in...");
        await surreal.signin({ username: surrealUser, password: surrealPass });
        console.log("Selecting DB...");
        // Use 'namespace' and 'database' for clarity/compatibility
        await surreal.use({ namespace: surrealNs, database: surrealDb });
        console.log("✅ Connected to SurrealDB");
    } catch (e) {
        console.error("❌ Failed to connect to SurrealDB:", e);
        process.exit(1);
    }

    // 1. Migrate Users
    console.log("Migrating Users...");
    const usersRs = await turso.execute("SELECT * FROM users");
    for (const row of usersRs.rows) {
        const userId = row.id;
        // Check for settings
        const settingsRs = await turso.execute({ sql: "SELECT settings FROM user_settings WHERE user_id = ?", args: [userId] });
        let settings = {};
        if (settingsRs.rows.length > 0 && settingsRs.rows[0].settings) {
            try { settings = JSON.parse(settingsRs.rows[0].settings); } catch (e) { }
        }

        await surreal.query(`
            UPDATE user:⟨${userId}⟩ CONTENT {
                email: $email,
                first_name: $first_name,
                last_name: $last_name,
                profile_picture_url: $pfp,
                stripe_customer_id: $stripe_id,
                subscription_tier: $tier,
                settings: $settings,
                created_at: $created_at,
                last_active_at: $last_active_at
            };
        `, {
            email: row.email,
            first_name: row.first_name,
            last_name: row.last_name,
            pfp: row.profile_picture_url,
            stripe_id: row.stripe_customer_id,
            tier: row.subscription_tier || 'free',
            settings: settings,
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            last_active_at: row.last_active_at ? new Date(row.last_active_at).toISOString() : new Date().toISOString(),
        });
    }
    console.log(`✅ Migrated ${usersRs.rows.length} users.`);

    // 2. Migrate Dashboards (v2)
    console.log("Migrating Dashboards...");

    // Bulk fetch permissions and elements to avoid SQL issues in loop
    console.log("...Fetching permissions and elements...");
    const permsMap = new Map();
    try {
        const pRows = await turso.execute("SELECT * FROM dashboard_permissions");
        for (const r of pRows.rows) {
            if (!permsMap.has(r.dashboard_id)) permsMap.set(r.dashboard_id, []);
            permsMap.get(r.dashboard_id).push(r);
        }
    } catch (e) { console.warn("Partial migration: Failed to fetch permissions", e.message); }

    const elemsMap = new Map();
    try {
        const eRows = await turso.execute("SELECT * FROM dashboard_elements");
        for (const r of eRows.rows) {
            if (!elemsMap.has(r.dashboard_id)) elemsMap.set(r.dashboard_id, []);
            elemsMap.get(r.dashboard_id).push(r);
        }
    } catch (e) { console.warn("Partial migration: Failed to fetch elements", e.message); }

    const dashRs = await turso.execute("SELECT * FROM dashboards_v2");
    for (const row of dashRs.rows) {
        const dashId = row.id;
        const ownerId = row.user_id; // Owner

        await surreal.query(`
            UPDATE dashboard:⟨${dashId}⟩ CONTENT {
                title: $title,
                owner: $owner,
                created_at: $created_at,
                updated_at: $updated_at
            };
        `, {
            title: row.title,
            owner: `user:${ownerId}`,
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        });

        // Permissions
        const dbPerms = permsMap.get(dashId) || [];
        for (const p of dbPerms) {
            const pUser = p.user_email ? null : p.user_id;
            if (p.user_id) {
                // Deterministic ID for idempotency: [dashboard_id]_[user_id]
                const permId = `${dashId}_${p.user_id}`;
                await surreal.query(`
                    UPDATE dashboard_permission:⟨${permId}⟩ CONTENT {
                        dashboard: $dash,
                        user: $user,
                        role: $role,
                        created_at: time::now()
                    };
                `, {
                    dash: `dashboard:${dashId}`,
                    user: `user:${p.user_id}`,
                    role: p.access_level || 'viewer'
                });
            }
        }

        // Elements
        const dbElems = elemsMap.get(dashId) || [];
        for (const el of dbElems) {
            const config = JSON.parse(el.config || '{}');
            await surreal.query(`
                UPDATE dashboard_element:⟨${el.id}⟩ CONTENT {
                    dashboard: $dash,
                    created_by: $user,
                    type: $type,
                    x: $x,
                    y: $y,
                    w: $w,
                    h: $h,
                    config: $config
                };
             `, {
                dash: `dashboard:${dashId}`,
                user: `user:${ownerId}`,
                type: el.type,
                x: el.x, y: el.y, w: el.w, h: el.h,
                config: config
            });
        }
    }
    console.log(`✅ Migrated ${dashRs.rows.length} dashboards.`);

    // 3. Migrate Chats
    console.log("Migrating Chats...");
    const chatsRs = await turso.execute("SELECT * FROM chats");
    for (const chat of chatsRs.rows) {
        const chatId = chat.id;
        let messages = [];
        try {
            if (chat.messages && chat.messages !== '[]') {
                messages = JSON.parse(chat.messages);
            } else {
                // Fetch legacy messages
                const msgRs = await turso.execute({ sql: "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC", args: [chatId] });
                messages = msgRs.rows.map(m => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    created_at: m.created_at
                }));
            }
        } catch (e) {
            messages = [];
        }

        await surreal.query(`
            UPDATE chat:⟨${chatId}⟩ CONTENT {
                user: $user,
                title: $title,
                messages: $messages,
                created_at: $created_at,
                updated_at: $updated_at
            };
        `, {
            user: `user:${chat.user_id}`,
            title: chat.title,
            messages: messages,
            created_at: chat.created_at ? new Date(chat.created_at * 1000).toISOString() : new Date().toISOString(),
            updated_at: chat.updated_at ? new Date(chat.updated_at * 1000).toISOString() : new Date().toISOString()
        });
    }
    console.log(`✅ Migrated ${chatsRs.rows.length} chats.`);

    // 4. Migrate Connections
    console.log("Migrating Connections...");
    const connsRs = await turso.execute("SELECT * FROM connections");
    for (const c of connsRs.rows) {
        let config = {};
        try { config = JSON.parse(c.config); } catch (e) { }

        await surreal.query(`
            UPDATE connection:⟨${c.id}⟩ CONTENT {
                user: $user,
                nickname: $nickname,
                description: $description,
                provider: $provider,
                config: $config,
                created_at: $created_at
            };
        `, {
            user: `user:${c.user_id}`,
            nickname: c.nickname,
            description: c.description,
            provider: c.provider,
            config: config,
            created_at: c.created_at ? new Date(c.created_at * 1000).toISOString() : new Date().toISOString()
        });
    }
    console.log(`✅ Migrated ${connsRs.rows.length} connections.`);

    // 5. Migrate Query History
    console.log("Migrating Query History...");
    const qRs = await turso.execute("SELECT * FROM queries");
    for (const q of qRs.rows) {
        await surreal.query(`
            UPDATE query_history:⟨${q.id}⟩ CONTENT {
                user: $user,
                query: $query,
                source: $source,
                model: $model,
                status: $status,
                connection: $conn,
                tokens_used: $tokens,
                created_at: $created_at
            };
        `, {
            user: `user:${q.user_id}`,
            query: q.query,
            source: q.source,
            model: q.model,
            status: q.status,
            conn: q.connection_id ? `connection:${q.connection_id}` : null,
            tokens: q.tokens_used,
            created_at: q.created_at ? new Date(q.created_at * 1000).toISOString() : new Date().toISOString()
        });
    }
    console.log(`✅ Migrated ${qRs.rows.length} queries.`);

    console.log("🎉 Migration Complete!");
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
