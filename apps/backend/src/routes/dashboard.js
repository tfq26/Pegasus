import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import crypto from "crypto"
import { db } from "../../db/surreal.js"

const dashboard = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const workos = new WorkOS(process.env.WORKOS_API_KEY || "sk_test_placeholder")

// Helper to get token from cookie or Authorization header
const getToken = (c) => {
    // Try cookie first (desktop/same-domain)
    let token = getCookie(c, "session")

    // Fallback to Authorization header (mobile/cross-domain)
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }

    return token
}

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
            // User doesn't exist by ID. Check if email is taken by another ID (stale record/collision)
            const [emailCheck] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });

            if (emailCheck && emailCheck.length > 0) {
                const staleId = emailCheck[0].id;
                console.warn(`[Dashboard] Email collision detected. Email ${payload.email} is held by ${staleId}, but current user is ${userRecordId}. Archiving old email.`);

                // Archive the old user's email to free it up
                await db.query(`UPDATE ${staleId} SET email = $archivedEmail`, {
                    archivedEmail: `archived_${Date.now()}_${payload.email}`
                });
            }

            // Now safely create the new user
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        return c.json({ ok: true })
    } catch (error) {
        return c.json({ error: "Failed to save" }, 500)
    }
})

// Dashboard V2 Endpoints (Multi-dashboard)
dashboard.get("/dashboards", async (c) => {
    const token = getToken(c)
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
    const token = getToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Ensure user exists in DB before linking
        await upsertUser(payload);

        const { title, data } = await c.req.json()

        // Create Dashboard Record with embedded data
        console.log('[Dashboard] Creating dashboard for user:', userId, 'Title:', title);
        const [created] = await db.query(`
        CREATE dashboard CONTENT {
            title: $title,
            owner: type::thing('user', $owner_id),
            cover_image: $cover_image,
            data: $data,
            created_at: time::now(),
            updated_at: time::now()
        };
    `, {
            title,
            owner_id: userId,
            cover_image: data?.cover_image || '',
            data: data || { layout: [], elements: [] }
        });

        console.log('[Dashboard] DB Create Result:', JSON.stringify(created));

        if (!created || !created[0]) {
            console.error('[Dashboard] DB returned no result/records');
            throw new Error("DB creation failed");
        }

        const dashboardId = created[0].id;
        console.log('[Dashboard] Created dashboard with', data?.elements?.length || 0, 'elements');

        return c.json({ id: dashboardId })
    } catch (e) {
        console.error('[Dashboard] Create error:', e)
        return c.json({ error: "Failed to create dashboard" }, 500)
    }
})

dashboard.get("/dashboards/shared", async (c) => {
    const token = getToken(c)
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
            WHERE user = type::thing($user)
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
    const token = getToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log(`[Dashboard] Fetching dashboard: ${id} for user: ${userId}`)

        // Fetch Dashboard with embedded data
        const [result] = await db.query(`
        SELECT 
            *,
            (owner = type::thing('user', $userId)) as is_owner,
            (SELECT role FROM dashboard_permission WHERE user = type::thing('user', $userId) AND dashboard = $parent.id)[0] as permission_role
        FROM ${id};
    `, { userId });

        if (!result || result.length === 0) return c.json({ error: "Dashboard not found" }, 404)
        const dashboard = result[0]

        // Check Permissions
        let role = null;
        if (dashboard.is_owner) role = 'owner';
        else if (dashboard.permission_role) role = dashboard.permission_role;

        if (!role && !dashboard.is_public) {
            console.log(`[Dashboard] Access denied for user ${userId} to dashboard ${id}`)
            return c.json({ error: "Unauthorized" }, 403)
        }

        const cleanId = (rid) => rid.toString().split(':')[1] || rid.toString();

        // Populate created_by names for elements
        let elements = dashboard.data?.elements || [];
        if (elements.length > 0) {
            // Extract unique user IDs
            const userIds = [...new Set(elements.map(e => e.created_by).filter(Boolean))];

            if (userIds.length > 0) {
                try {
                    // Fetch user details
                    // userIds are like ["user:xxx", "user:yyy"]
                    // We need to fetch these records
                    console.log('[Dashboard] Fetching creator details for:', userIds);

                    // SurrealDB simple select for list of IDs
                    // "SELECT id, first_name, last_name, email FROM user:xxx, user:yyy"
                    const users = await db.query(`SELECT id, first_name, last_name, email FROM ${userIds.join(', ')}`);

                    // Create map: "user:xxx" -> "John Doe"
                    const userMap = {};
                    if (users && users[0]) {
                        users[0].forEach(u => {
                            const name = (u.first_name && u.last_name)
                                ? `${u.first_name} ${u.last_name}`
                                : (u.email || 'Unknown');
                            userMap[u.id] = name;
                        });
                    }

                    // Replace ID with Name in the response (not DB)
                    elements = elements.map(el => ({
                        ...el,
                        created_by: userMap[el.created_by] || 'Unknown'
                    }));
                } catch (err) {
                    console.error('[Dashboard] Failed to fetch creator details:', err);
                }
            }
        }

        // Return dashboard with embedded data
        const responseDashboard = {
            ...dashboard,
            id: cleanId(dashboard.id),
            access_level: role || (dashboard.is_public ? 'viewer' : null),
            data: {
                ...(dashboard.data || {}),
                layout: dashboard.data?.layout || [],
                elements: elements
            }
        };

        console.log(`[Dashboard] Returning dashboard with ${responseDashboard.data.elements?.length || 0} elements`)

        return c.json({ dashboard: responseDashboard })
    } catch (e) {
        console.error('[Dashboard] Fetch error:', e)
        return c.json({ error: "Failed to fetch dashboard" }, 500)
    }
})

dashboard.put("/dashboards/:id", async (c) => {
    const token = getToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const { title, data } = await c.req.json()

        console.log('[Dashboard] Update request for:', id)
        console.log('[Dashboard] Title:', title)
        console.log('[Dashboard] Data elements:', data?.elements?.length || 0)
        console.log('[Dashboard] Data layout:', JSON.stringify(data?.layout, null, 2))

        // Build update query
        const updates = []
        const params = { userId }

        if (title) {
            updates.push('title = $title')
            params.title = title
        }

        if (data?.cover_image !== undefined) {
            updates.push('cover_image = $cover_image')
            params.cover_image = data.cover_image
        }

        if (data) {
            updates.push('data = $data')
            params.data = data
        }

        updates.push('updated_at = time::now()')

        const query = `
            UPDATE ${id} SET ${updates.join(', ')}
            WHERE owner = type::thing('user', $userId)
               OR (SELECT role FROM dashboard_permission WHERE user=type::thing('user', $userId) AND dashboard=$parent.id)[0] IN ['editor', 'owner'];
        `

        const result = await db.query(query, params);
        console.log('[Dashboard] Updated successfully')

        return c.json({ ok: true })
    } catch (e) {
        console.error('[Dashboard] Update error:', e)
        return c.json({ error: "Failed to update dashboard" }, 500)
    }
})

// Privacy update endpoint
dashboard.put("/dashboards/:id/privacy", async (c) => {
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
    const token = getToken(c)
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
