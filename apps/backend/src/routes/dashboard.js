import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import crypto from "crypto"
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
            cover_image,
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
            cover_image: $cover_image,
            created_at: time::now(),
            updated_at: time::now()
        };
    `, {
            title,
            owner_id: userId,
            cover_image: data?.cover_image || ''
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

dashboard.get("/dashboards/shared", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const userRecId = `user:${userId}`

        // Fetch dashboards shared with this user via dashboard_permission
        // We join with the dashboard table and fetch the owner details
        const [results] = await db.query(`
            SELECT 
                role,
                created_at as shared_at,
                dashboard.id as id,
                dashboard.title as title,
                dashboard.cover_image as cover_image,
                dashboard.updated_at as updated_at,
                dashboard.owner.first_name as owner_first_name,
                dashboard.owner.last_name as owner_last_name,
                dashboard.owner.email as owner_email,
                dashboard.owner as owner_id
            FROM dashboard_permission 
            WHERE user = $user
            ORDER BY created_at DESC;
        `, {
            user: userRecId
        });

        // Format the response to look like regular dashboards but with owner info
        const sharedDashboards = results.map(item => ({
            id: item.id,
            title: item.title,
            cover_image: item.cover_image,
            updated_at: item.updated_at, // Use original dashboard updated_at
            shared_at: item.shared_at,
            role: item.role,
            owner: {
                id: item.owner_id,
                first_name: item.owner_first_name,
                last_name: item.owner_last_name,
                email: item.owner_email
            },
            is_shared: true
        }));

        return c.json({ dashboards: sharedDashboards })
    } catch (e) {
        console.error("Failed to fetch shared dashboards:", e)
        return c.json({ error: "Failed to fetch shared dashboards" }, 500)
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
        SELECT * FROM dashboard_element WHERE dashboard = ${id};
    `);
        console.log(`[Dashboard] Fetched ${elements.length} elements for dashboard:`, id)
        console.log('[Dashboard] Elements:', elements)

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

        console.log('[Dashboard] Update request for:', id)
        console.log('[Dashboard] Title:', title)
        console.log('[Dashboard] Data:', data)
        console.log('[Dashboard] cover_image in data:', data?.cover_image)

        // 1. Update Title and Cover Image
        if (title || data?.cover_image !== undefined) {
            try {
                const updates = []
                const params = { user: `user:${userId}` }

                if (title) {
                    updates.push('title = $title')
                    params.title = title
                    console.log('[Dashboard] Will update title to:', title)
                }

                if (data?.cover_image !== undefined) {
                    updates.push('cover_image = $cover_image')
                    params.cover_image = data.cover_image
                    console.log('[Dashboard] Will update cover_image to:', data.cover_image)
                }

                updates.push('updated_at = time::now()')

                const query = `
            UPDATE ${id} SET ${updates.join(', ')}
            WHERE owner = type::thing('user', $userId)
               OR (SELECT role FROM dashboard_permission WHERE user=type::thing('user', $userId) AND dashboard=$parent.id)[0] IN ['editor', 'owner'];
        `
                console.log('[Dashboard] Update query:', query)
                console.log('[Dashboard] Update params:', params)
                console.log('[Dashboard] User ID:', userId)

                const result = await db.query(query, { ...params, userId });
                console.log('[Dashboard] Update result:', result)
            } catch (e) {
                console.error('[Dashboard] Update error:', e)
            }
        }

        // 2. Update Elements (Granular Sync simulated)
        if (data && data.elements) {
            const [existing] = await db.query(`SELECT id FROM dashboard_element WHERE dashboard = ${id}`);
            console.log('[Dashboard] Existing elements from DB:', existing)

            // Extract just the UUID part from RecordId objects or strings
            const existingIds = new Set(existing.map(e => {
                const idStr = typeof e.id === 'string' ? e.id : e.id.toString()
                let uuid = idStr.includes(':') ? idStr.split(':')[1] : idStr
                // Remove angle brackets if present (SurrealDB wraps UUIDs with hyphens)
                uuid = uuid.replace(/[⟨⟩]/g, '')
                return uuid
            }));

            console.log('[Dashboard] Existing element IDs:', Array.from(existingIds))
            const incomingIds = new Set();

            console.log(`[Dashboard] Processing ${data.elements.length} elements...`)
            for (const el of data.elements) {
                const elId = el.id;
                console.log(`[Dashboard] Element ${elId} (${el.type}) - processing...`)
                incomingIds.add(elId);
                const ui_layout = data.layout?.find(l => l.i === elId || l.i === `dashboard_element:${elId}`);

                if (existingIds.has(elId)) {
                    console.log(`[Dashboard] Element ${elId} exists. Updating...`)
                    // UPDATE
                    try {
                        await db.query(`
                UPDATE type::thing('dashboard_element', $elId) MERGE {
                    title: $title,
                    config: $config,
                    query: $query,
                    ui_layout: $layout
                } WHERE created_by = type::thing('user', $userId) 
                   OR dashboard.owner = type::thing('user', $userId)
                   OR (dashboard IN (SELECT VALUE dashboard FROM dashboard_permission WHERE user=type::thing('user', $userId) AND role='owner'));
            `, {
                            elId: elId,
                            userId: userId,
                            title: el.title,
                            config: el.config,
                            query: el.query || null,
                            layout: ui_layout || {}
                        });
                    } catch (err) {
                        console.error(`[Dashboard] Update failed for ${elId}:`, err)
                    }
                } else {
                    console.log(`[Dashboard] Element ${elId} is NEW. Creating...`)
                    // CREATE
                    try {
                        const createResult = await db.query(`
                    CREATE type::thing('dashboard_element', $elId) CONTENT {
                        dashboard: ${id},
                        type: $type,
                        title: $title,
                        config: $config,
                        query: $query,
                        created_by: type::thing('user', $userId),
                        ui_layout: $layout,
                        created_at: time::now()
                    };
                `, {
                            elId: elId,
                            userId: userId,
                            type: el.type,
                            title: el.title,
                            config: el.config,
                            query: el.query || null,
                            layout: ui_layout || {}
                        });
                        console.log(`[Dashboard] Created element ${elId}:`, JSON.stringify(createResult, null, 2))
                    } catch (err) {
                        console.error(`[Dashboard] Create failed for ${elId}:`, err)
                    }
                }
            }

            // DELETE
            for (const oldId of existingIds) {
                if (!incomingIds.has(oldId)) {
                    await db.query(`
                DELETE type::thing('dashboard_element', $oldId) 
                WHERE created_by = type::thing('user', $userId)
                   OR dashboard.owner = type::thing('user', $userId)
                   OR (dashboard IN (SELECT VALUE dashboard FROM dashboard_permission WHERE user=type::thing('user', $userId) AND role='owner'));
            `, { oldId: oldId, userId: userId });
                }
            }
        }

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to update dashboard" }, 500)
    }
})

// Privacy update endpoint
dashboard.put("/dashboards/:id/privacy", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const { is_public } = await c.req.json()

        console.log(`[Dashboard] Updating privacy for ${id} to is_public=${is_public}`)

        // Only owner can change privacy
        const [checkResult] = await db.query(`
            SELECT * FROM ${id} WHERE owner = type::thing('user', $userId);
        `, { userId })

        if (!checkResult || checkResult.length === 0) {
            return c.json({ error: "Only the owner can change privacy settings" }, 403)
        }

        // If making private, remove all permissions and share token
        if (!is_public) {
            console.log(`[Dashboard] Making private - removing all permissions for ${id}`)

            // Delete all permissions for this dashboard
            await db.query(`
                DELETE dashboard_permission WHERE dashboard = ${id};
            `)

            // Update dashboard: set private and remove share token
            await db.query(`
                UPDATE ${id} SET is_public = false, share_token = NONE, updated_at = time::now()
                WHERE owner = type::thing('user', $userId);
            `, { userId })
        } else {
            // Making public
            await db.query(`
                UPDATE ${id} SET is_public = true, updated_at = time::now()
                WHERE owner = type::thing('user', $userId);
            `, { userId })
        }

        console.log(`[Dashboard] Privacy updated successfully for ${id}`)
        return c.json({ ok: true, is_public })
    } catch (e) {
        console.error('[Dashboard] Privacy update error:', e)
        return c.json({ error: "Failed to update privacy settings" }, 500)
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
    console.log('[Dashboard] ===== SHARE ENDPOINT HIT =====')
    const token = getCookie(c, "session")
    console.log('[Dashboard] Session token present:', !!token)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        console.log('[Dashboard] Raw ID from params:', id)
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log('[Dashboard] Share request for:', id, 'by user:', userId)

        // First, check if share_token already exists
        const [existing] = await db.query(`SELECT share_token FROM ${id} WHERE owner = type::thing('user', $userId)`, { userId });

        console.log('[Dashboard] Existing dashboard:', JSON.stringify(existing, null, 2))

        let shareToken;
        if (existing && existing[0] && existing[0].share_token) {
            // Use existing token
            shareToken = existing[0].share_token;
            console.log('[Dashboard] Using existing share token:', shareToken)
        } else {
            // Generate new token
            shareToken = crypto.randomUUID();
            console.log('[Dashboard] Generated new share token:', shareToken)
        }

        // Update dashboard to set share_token and make it public
        console.log('[Dashboard] About to execute UPDATE query...')
        const updateResult = await db.query(`
      UPDATE ${id} SET share_token = $shareToken, is_public = true 
      WHERE owner = type::thing('user', $userId);
    `, { shareToken, userId });

        console.log('[Dashboard] Share update result:', JSON.stringify(updateResult, null, 2))

        console.log('[Dashboard] Share successful, token:', shareToken)
        return c.json({ token: shareToken })
    } catch (e) {
        console.error('[Dashboard] ===== SHARE ERROR =====')
        console.error('[Dashboard] Error type:', e.constructor.name)
        console.error('[Dashboard] Error message:', e.message)
        console.error('[Dashboard] Error stack:', e.stack)
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
        const userRecId = `user:${userId}`;
        console.log(`[Invite] Verifying ownership for dashboard ${id}, user ${userRecId}`);

        try {
            // Check if dashboard exists first
            const [exists] = await db.query(`SELECT * FROM ${id}`);
            console.log(`[Invite] Dashboard exists check:`, !!exists[0]);
            if (exists[0]) {
                console.log(`[Invite] Dashboard owner:`, exists[0].owner);
                console.log(`[Invite] Current user:`, userRecId);
                console.log(`[Invite] Match?`, exists[0].owner.toString() === userRecId);
            }
        } catch (err) {
            console.error('[Invite] Error checking dashboard:', err);
        }

        const [ownerCheck] = await db.query(`SELECT 1 FROM ${id} WHERE <string>owner = $user;`, { user: userRecId });
        console.log(`[Invite] Owner check result:`, ownerCheck);

        if (!ownerCheck.length) {
            console.warn(`[Invite] Ownership verification failed for dashboard ${id} and user ${userRecId}`);
            return c.json({ error: "Dashboard not found or unauthorized" }, 404)
        }

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
        console.log(`[Invite] Granting permission. Target: ${targetUserId}, Dashboard: ${id}`);
        try {
            await db.query(`
                DELETE dashboard_permission WHERE user=type::thing($target) AND dashboard=type::thing($dashboard);
                CREATE dashboard_permission CONTENT {
                    user: type::thing($target),
                    dashboard: type::thing($dashboard),
                    role: 'read',
                    created_at: time::now()
                };
            `, {
                target: targetUserId,
                dashboard: id
            });
            console.log(`[Invite] Permission granted successfully`);
        } catch (queryErr) {
            console.error(`[Invite] Permission query failed:`, queryErr);
            throw queryErr;
        }

        return c.json({ ok: true })
    } catch (e) {
        console.error(`[Invite] Final error catch:`, e);
        return c.json({ error: "Failed to invite user: " + e.message }, 500)
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

// File upload endpoint
dashboard.post("/dashboards/:dashboardId/files", async (c) => {
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const dashboardId = c.req.param("dashboardId")
        const fullDashboardId = dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`

        // Parse multipart form data
        const formData = await c.req.formData()
        const file = formData.get('file')

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file provided" }, 400)
        }

        // Check file size (200MB limit)
        if (file.size > 200 * 1024 * 1024) {
            return c.json({ error: "File exceeds 200MB limit" }, 400)
        }

        // Convert file to base64 for storage (simple approach)
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        // Create file record
        const fileId = crypto.randomUUID()

        const [result] = await db.query(`
            CREATE type::thing('dashboard_file', $fileId) CONTENT {
                dashboard: ${fullDashboardId},
                file_name: $fileName,
                file_size: $fileSize,
                file_type: $fileType,
                file_data: $fileData,
                uploaded_by: type::thing('user', $userId),
                created_at: time::now()
            };
        `, {
            fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            fileData: base64,
            userId
        })

        console.log(`[Dashboard] File uploaded: ${fileId} (${file.name}, ${file.size} bytes)`)

        return c.json({
            fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
        })
    } catch (e) {
        console.error('[Dashboard] File upload error:', e)
        return c.json({ error: "Failed to upload file" }, 500)
    }
})

// File download endpoint
dashboard.get("/files/:fileId", async (c) => {
    try {
        const fileId = c.req.param("fileId")

        const [result] = await db.query(`
            SELECT * FROM type::thing('dashboard_file', $fileId);
        `, { fileId })

        if (!result || result.length === 0) {
            return c.json({ error: "File not found" }, 404)
        }

        const fileRecord = result[0]

        // Convert base64 back to buffer
        const buffer = Buffer.from(fileRecord.file_data, 'base64')

        // Return file with proper headers
        return new Response(buffer, {
            headers: {
                'Content-Type': fileRecord.file_type || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${fileRecord.file_name}"`,
                'Content-Length': buffer.length.toString()
            }
        })
    } catch (e) {
        console.error('[Dashboard] File download error:', e)
        return c.json({ error: "Failed to download file" }, 500)
    }
})

export { dashboard as dashboardRoutes }
