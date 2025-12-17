import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import { db } from "../../db/surreal.js"

const dashboard = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const workos = new WorkOS(process.env.WORKOS_API_KEY || "sk_test_placeholder")

// Helper to ensure user exists
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        console.log(`[Dashboard] Upserting user: ${userRecordId}`)

        // Check if user exists first
        const [existing] = await db.query(`SELECT id FROM ${userRecordId}`);

        if (existing && existing.length > 0) {
            // User exists, just update
            await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    first_name = $firstName,
                    last_name = $lastName,
                    profile_picture_url = $pic,
                    updated_at = time::now();
            `, {
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
            console.log(`[Dashboard] User updated: ${payload.email}`)
        } else {
            // User doesn't exist, create
            await db.query(`
                CREATE ${userRecordId} CONTENT {
                    email: $email,
                    first_name: $firstName,
                    last_name: $lastName,
                    profile_picture_url: $pic,
                    created_at: time::now(),
                    updated_at: time::now()
                };
            `, {
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
            console.log(`[Dashboard] User created: ${payload.email}`)
        }

    } catch (e) {
        console.error("[Dashboard] Failed to upsert user:", e)
        throw e
    }
}

// Dashboard Routes

// Legacy single dashboard endpoint (Keep for backward compatibility or future use?)
dashboard.get("/dashboard", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Fetch all elements for user (legacy view)
        const [elements] = await db.query(`
        SELECT * FROM dashboard_element 
        WHERE created_by = $user 
           OR dashboard.owner = $user
        ORDER BY created_at DESC;
    `, { user: `user:${userId}` });

        return c.json({ elements })
    } catch (e) {
        return c.json({ error: "Failed to fetch dashboard" }, 500)
    }
})

// Legacy POST elements
dashboard.post("/dashboard/elements", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload)
        const { type, title, config, query, dashboardId } = await c.req.json()

        // We'll generate an ID if not provided, basically relies on Surreal.
        const [created] = await db.query(`
        CREATE dashboard_element CONTENT {
            dashboard: $dashboard,
            type: $type,
            title: $title,
            config: $config,
            query: $query,
            created_by: $user,
            created_at: time::now()
        };
    `, {
            dashboard: dashboardId ? (dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`) : undefined,
            type,
            title,
            config: typeof config === 'string' ? JSON.parse(config) : config,
            query,
            user: `user:${userId}`
        });

        // Return UUID without prefix
        return c.json({ id: created[0].id.toString().split(':')[1] || created[0].id })
    } catch (e) {
        return c.json({ error: "Failed to create dashboard element" }, 500)
    }
})

dashboard.delete("/dashboard/elements/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard_element:${id}`

        await db.query(`
        DELETE ${id} 
        WHERE created_by = $user OR dashboard.owner = $user;
    `, { user: `user:${userId}` });

        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: "Failed to delete dashboard element" }, 500)
    }
})

dashboard.put("/dashboard/elements/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard_element:${id}`
        const { query, config, title } = await c.req.json()

        await db.query(`
        UPDATE ${id} MERGE {
            query: $query,
            config: $config,
            title: $title
        } WHERE created_by = $user OR dashboard.owner = $user;
    `, {
            query,
            config: config ? (typeof config === 'string' ? JSON.parse(config) : config) : undefined,
            title,
            user: `user:${userId}`
        });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to update dashboard element" }, 500)
    }
})

// Legacy Layout
dashboard.get("/dashboard/layout", async (c) => {
    return c.json({ layout: null })
})

dashboard.post("/dashboard/layout", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        return c.json({ ok: true })
    } catch (error) {
        return c.json({ error: "Failed to save" }, 500)
    }
})

// Dashboard V2 Endpoints (Multi-dashboard)
dashboard.get("/dashboards", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        console.log(`[Dashboard] Fetching dashboards for user: user:${userId}`)

        const [dashboards] = await db.query(`
        SELECT 
            id, 
            title, 
            is_public, 
            owner,
            created_at,
            updated_at
        FROM dashboard 
        WHERE owner = type::thing('user', $userId)
        ORDER BY updated_at DESC;
    `, {
            userId: userId
        });

        console.log(`[Dashboard] Found ${dashboards?.length || 0} dashboards:`, JSON.stringify(dashboards))

        return c.json({ dashboards })
    } catch (e) {
        console.error("[Dashboard] Error fetching dashboards:", e)
        return c.json({ error: "Failed to fetch dashboards" }, 500)
    }
})

dashboard.post("/dashboards", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Ensure user exists in DB before linking
        await upsertUser(payload);

        const { title, data } = await c.req.json()

        // Create Dashboard Record
        console.log('[Dashboard] Creating dashboard for user:', userId, 'Title:', title);
        const [created] = await db.query(`
        CREATE dashboard CONTENT {
            title: $title,
            owner: type::thing('user', $owner_id),
            created_at: time::now(),
            updated_at: time::now()
        };
    `, {
            title,
            owner_id: userId
        });

        console.log('[Dashboard] DB Create Result:', JSON.stringify(created));

        if (!created || !created[0]) {
            console.error('[Dashboard] DB returned no result/records');
            throw new Error("DB creation failed");
        }

        const dashboardId = created[0].id; // `dashboard:uuid`
        console.log('[Dashboard] Created ID:', dashboardId);

        // Create Elements (from initial data blob)
        if (data && data.elements && Array.isArray(data.elements)) {
            console.log('[Dashboard] Creating elements:', data.elements.length);
            for (const el of data.elements) {
                await db.query(`
                 CREATE dashboard_element CONTENT {
                     dashboard: $dashboard,
                     type: $type,
                     title: $title,
                     config: $config,
                     query: $query,
                     created_by: $user,
                     ui_layout: $layout,
                     created_at: time::now()
                 };
             `, {
                    dashboard: dashboardId,
                    type: el.type,
                    title: el.title,
                    config: el.config,
                    query: el.query,
                    user: `user:${userId}`,
                    layout: data.layout?.find(l => l.i === el.id) || {}
                });
            }
        }

        return c.json({ id: dashboardId })
    } catch (e) {
        console.error('[Dashboard] Create Error:', e);
        return c.json({ error: "Failed to create dashboard: " + e.message }, 500)
    }
})

dashboard.get("/dashboards/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log(`[Dashboard] Fetching dashboard: ${id} for user: ${userId}`)

        // 1. Fetch Dashboard Metadata & Access Level
        const [result] = await db.query(`
        SELECT 
            *,
            (owner = type::thing('user', $userId)) as is_owner,
            (SELECT role FROM dashboard_permission WHERE user = type::thing('user', $userId) AND dashboard = $parent.id)[0] as permission_role
        FROM ${id};
    `, { userId });

        console.log(`[Dashboard] Query result:`, result)

        if (!result || result.length === 0) return c.json({ error: "Dashboard not found" }, 404)
        const dashboard = result[0]

        // 2. Check Permissions
        let role = null;
        if (dashboard.is_owner) role = 'owner';
        else if (dashboard.permission_role) role = dashboard.permission_role;

        if (!role && !dashboard.is_public) {
            console.log(`[Dashboard] Access denied for user ${userId} to dashboard ${id}`)
            return c.json({ error: "Unauthorized" }, 403)
        }

        // 3. Fetch Elements
        const [elements] = await db.query(`
        SELECT * FROM dashboard_element WHERE dashboard = $id;
    `, { id });

        // 4. Construct Response
        const layout = elements.map(el => {
            if (el.ui_layout) return { ...el.ui_layout, i: el.id };
            return { i: el.id, x: 0, y: 0, w: 2, h: 2 };
        })

        const cleanId = (rid) => rid.toString().split(':')[1] || rid.toString();

        const responseDashboard = {
            ...dashboard,
            id: cleanId(dashboard.id),
            access_level: role || (dashboard.is_public ? 'viewer' : null),
            data: {
                layout: layout.map(l => ({ ...l, i: cleanId(l.i) })),
                elements: elements.map(el => ({
                    ...el,
                    id: cleanId(el.id),
                    config: el.config,
                }))
            }
        };

        return c.json({ dashboard: responseDashboard })
    } catch (e) {
        return c.json({ error: "Failed to fetch dashboard" }, 500)
    }
})

dashboard.put("/dashboards/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const { title, data } = await c.req.json()

        // 1. Update Title
        if (title) {
            try {
                await db.query(`
            UPDATE ${id} SET title = $title, updated_at = time::now()
            WHERE owner = $user 
               OR (SELECT role FROM dashboard_permission WHERE user=$user AND dashboard=$parent.id)[0] IN ['editor', 'owner'];
        `, { title, user: `user:${userId}` });
            } catch (e) { }
        }

        // 2. Update Elements (Granular Sync simulated)
        if (data && data.elements) {
            const [existing] = await db.query(`SELECT id FROM dashboard_element WHERE dashboard = ${id}`);
            const existingIds = new Set(existing.map(e => e.id.toString().split(':')[1]));
            const incomingIds = new Set();

            for (const el of data.elements) {
                const elId = el.id;
                incomingIds.add(elId);
                const ui_layout = data.layout?.find(l => l.i === elId || l.i === `dashboard_element:${elId}`);

                if (existingIds.has(elId)) {
                    // UPDATE
                    await db.query(`
                UPDATE dashboard_element:${elId} MERGE {
                    title: $title,
                    config: $config,
                    query: $query,
                    ui_layout: $layout
                } WHERE created_by = $user 
                   OR dashboard.owner = $user
                   OR (dashboard IN (SELECT VALUE dashboard FROM dashboard_permission WHERE user=$user AND role='owner'));
            `, {
                        title: el.title,
                        config: el.config,
                        query: el.query,
                        layout: ui_layout || {},
                        user: `user:${userId}`
                    });
                } else {
                    // CREATE
                    await db.query(`
                CREATE dashboard_element:${elId} CONTENT {
                    dashboard: ${id},
                    type: $type,
                    title: $title,
                    config: $config,
                    query: $query,
                    created_by: $user,
                    ui_layout: $layout,
                    created_at: time::now()
                };
            `, {
                        type: el.type,
                        title: el.title,
                        config: el.config,
                        query: el.query,
                        layout: ui_layout || {},
                        user: `user:${userId}`
                    });
                }
            }

            // DELETE
            for (const oldId of existingIds) {
                if (!incomingIds.has(oldId)) {
                    await db.query(`
                DELETE dashboard_element:${oldId} 
                WHERE created_by = $user
                   OR dashboard.owner = $user
                   OR (dashboard IN (SELECT VALUE dashboard FROM dashboard_permission WHERE user=$user AND role='owner'));
            `, { user: `user:${userId}` });
                }
            }
        }

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to update dashboard" }, 500)
    }
})

dashboard.delete("/dashboards/:id", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log(`[Dashboard] Deleting dashboard: ${id} for user: ${userId}`)

        // Only Owner can delete - use type::thing() for proper comparison
        const result = await db.query(`DELETE ${id} WHERE owner = type::thing('user', $userId);`, { userId });

        console.log(`[Dashboard] Delete result:`, result)

        // Cleanup items (simplistic)
        await db.query(`DELETE dashboard_element WHERE dashboard = ${id}`);
        await db.query(`DELETE dashboard_permission WHERE dashboard = ${id}`);

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Dashboard] Delete error:", e)
        return c.json({ error: "Failed to delete" }, 500)
    }
})

dashboard.post("/dashboards/:id/share", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const shareToken = crypto.randomUUID()

        // Using 'dashboard' table instead of 'dashboards_v2' for consistency
        // Note: SQL args must use Surreal param syntax if using .query, but .execute uses $param
        await db.query(`
      UPDATE ${id} SET share_token = COALESCE(share_token, $token), is_public = true 
      WHERE owner = $user;
    `, { token: shareToken, user: `user:${userId}` });

        const [rs] = await db.query(`SELECT share_token FROM ${id} WHERE owner = $user`, { user: `user:${userId}` });

        if (!rs || !rs[0]) return c.json({ error: "Failed to share or unauthorized" }, 403)

        return c.json({ token: rs[0].share_token })
    } catch (e) {
        return c.json({ error: "Failed to share dashboard" }, 500)
    }
})

dashboard.post("/dashboards/:id/share/invite", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`
        const { email } = await c.req.json()

        if (!email) return c.json({ error: "Email is required" }, 400)

        // 1. Verify Ownership
        const [ownerCheck] = await db.query(`SELECT 1 FROM ${id} WHERE owner = $user;`, { user: `user:${userId}` });
        if (!ownerCheck.length) return c.json({ error: "Dashboard not found or unauthorized" }, 404)

        // 2. Verify User
        let workosUser = null
        try {
            const users = await workos.userManagement.listUsers({ email, limit: 1 })
            workosUser = users.data[0]
        } catch (e) { }

        const [localUserCheck] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });

        if (localUserCheck.length === 0) {
            return c.json({ error: "User must sign in to this application at least once before being invited." }, 400)
        }

        const targetUserId = localUserCheck[0].id;

        // 3. Grant Permission
        await db.query(`
        DELETE dashboard_permission WHERE user=$target AND dashboard=$dashboard;
        CREATE dashboard_permission CONTENT {
            user: $target,
            dashboard: $dashboard,
            role: 'read',
            created_at: time::now()
        };
    `, {
            target: targetUserId,
            dashboard: id
        });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to invite user" }, 500)
    }
})

dashboard.get("/dashboards/:id/permissions", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const [ownerCheck] = await db.query(`SELECT 1 FROM ${id} WHERE owner = $user;`, { user: `user:${userId}` });
        if (!ownerCheck.length) return c.json({ error: "Unauthorized" }, 404)

        const [permissions] = await db.query(`
        SELECT 
            role as access_level,
            user.email as email,
            created_at 
        FROM dashboard_permission 
        WHERE dashboard = $id;
    `, { id });

        return c.json({ permissions })
    } catch (e) {
        return c.json({ error: "Failed to fetch permissions" }, 500)
    }
})

dashboard.delete("/dashboards/:id/permissions/:email", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`
        const email = c.req.param("email")

        const [ownerCheck] = await db.query(`SELECT 1 FROM ${id} WHERE owner = $user;`, { user: `user:${userId}` });
        if (!ownerCheck.length) return c.json({ error: "Unauthorized" }, 404)

        const [userCheck] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });
        if (!userCheck.length) return c.json({ error: "User not found" }, 404)
        const targetUserId = userCheck[0].id;

        await db.query(`
        DELETE dashboard_permission WHERE dashboard = $id AND user = $user;
    `, { id, user: targetUserId });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to remove permission" }, 500)
    }
})

dashboard.get("/shared/dashboard/:token", async (c) => {
    try {
        const token = c.req.param("token")
        // Use dashboard table
        const [rs] = await db.query(`
      SELECT * FROM dashboard WHERE share_token = $token AND is_public = true;
    `, { token });

        if (!rs || !rs[0]) return c.json({ error: "Dashboard not found or not public" }, 404)
        const dashboard = rs[0];

        // Fetch elements for this dashboard
        const [elements] = await db.query(`SELECT * FROM dashboard_element WHERE dashboard = $id`, { id: dashboard.id });

        // Construct legacy data format if needed or basic V2
        const layout = elements.map(el => {
            if (el.ui_layout) return { ...el.ui_layout, i: el.id };
            return { i: el.id, x: 0, y: 0, w: 2, h: 2 };
        })

        // We recreate the full object including 'data' property that frontend expects
        const responseDashboard = {
            ...dashboard,
            data: {
                layout,
                elements
            }
        }

        return c.json({ dashboard: responseDashboard })
    } catch (e) {
        return c.json({ error: "Failed to fetch shared dashboard" }, 500)
    }
})

export { dashboard as dashboardRoutes }
