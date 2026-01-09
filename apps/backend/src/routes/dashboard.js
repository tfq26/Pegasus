import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import crypto from "crypto"
import { db } from "../../db/surreal.js"
import { SecretService } from "../services/SecretService.js"
import { canCreateDashboard } from "../../lib/tierLimits.js"
import { getIO, getRoom } from "../socket.js"

import { ConfigService } from "../services/ConfigService.js"

const dashboard = new Hono()
const jwtSecret = ConfigService.getJwtSecret()
const workos = new WorkOS(ConfigService.getWorkOSConfig().apiKey)

import { getAuthToken } from "../../lib/auth.js"

// Helper to ensure user exists
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`
        const [existing] = await db.query(`SELECT id FROM ${userRecordId}`);
        if (existing && existing.length > 0) {
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
        } else {
            const [emailCheck] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });
            if (emailCheck && emailCheck.length > 0) {
                const staleId = emailCheck[0].id;
                await db.query(`UPDATE ${staleId} SET email = $archivedEmail`, {
                    archivedEmail: `archived_${Date.now()}_${payload.email}`
                });
            }
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
        }
    } catch (e) {
        console.error("[Dashboard] Failed to upsert user:", e)
        throw e
    }
}

// Utility: Correct Role Determination
const getDashboardRole = async (userId, dashboardId) => {
    const rawDashId = dashboardId.includes(':') ? dashboardId.split(':')[1] : dashboardId;
    const rawUserId = userId.includes(':') ? userId.split(':')[1] : userId;
    const fullUserId = `user:${rawUserId}`;

    console.log(`[getDashboardRole] Checking role for User: ${rawUserId} (Full: ${fullUserId}) on Dashboard: ${rawDashId}`);

    try {
        // 1. Check Ownership
        const [dashResult] = await db.query(`
            SELECT owner FROM type::thing('dashboard', $dashId);
        `, { dashId: rawDashId });

        if (dashResult && dashResult.length > 0) {
            const owner = dashResult[0].owner;
            // Record IDs can be objects or strings
            const ownerId = (owner && typeof owner === 'object') ? (owner.id || String(owner)) : String(owner);

            console.log(`[getDashboardRole] DB Owner: ${ownerId}`);

            if (ownerId === fullUserId || ownerId === rawUserId || ownerId.endsWith(rawUserId)) {
                console.log(`[getDashboardRole] MATCH! User is owner.`);
                return 'owner';
            }
        }

        // 2. Check Permissions Table
        const [permCheck] = await db.query(`
            SELECT role FROM dashboard_permission 
            WHERE dashboard = type::thing('dashboard', $dashId) 
            AND user = type::thing('user', $userId) 
            LIMIT 1;
        `, { dashId: rawDashId, userId: rawUserId });

        if (permCheck && permCheck.length > 0) {
            console.log(`[getDashboardRole] Found role in permissions: ${permCheck[0].role}`);
            return permCheck[0].role;
        }

    } catch (err) {
        console.error("[getDashboardRole] Error:", err);
    }

    console.log(`[getDashboardRole] No role found.`);
    return null;
};

// Utility: Real-time Notifications
const notifyPermissionChange = async (email, dashboardId, role, type = 'update') => {
    try {
        if (!email) return;
        const io = getIO();
        if (!io) return;

        const dashId = dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`;
        const [dashboards] = await db.query(`SELECT title FROM ${dashId}`);
        const title = dashboards?.[0]?.title || 'Unknown Dashboard';

        const sockets = await io.fetchSockets();
        const targetSocket = sockets.find(s => s.user?.email === email);

        if (targetSocket) {
            targetSocket.emit("permission_updated", {
                dashboardId: dashId,
                title,
                role,
                type,
                message: type === 'invite'
                    ? `You have been invited to '${title}' (Role: ${role})`
                    : `Your access to '${title}' has been updated to ${role}`
            });
        }
    } catch (e) {
        console.error("[Notify] Failed to send permission notification:", e);
    }
}

// REST Routes

// Legacy single dashboard endpoint
dashboard.get("/dashboard", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
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

dashboard.post("/dashboard/elements", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload)
        const { type, title, config, query, dashboardId } = await c.req.json()
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
        return c.json({ id: created[0].id.toString().split(':')[1] || created[0].id })
    } catch (e) {
        return c.json({ error: "Failed to create dashboard element" }, 500)
    }
})

dashboard.delete("/dashboard/elements/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard_element:${id}`
        await db.query(`DELETE ${id} WHERE created_by = $user OR dashboard.owner = $user;`, { user: `user:${userId}` });
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: "Failed to delete dashboard element" }, 500)
    }
})

dashboard.put("/dashboard/elements/:id", async (c) => {
    const token = getAuthToken(c)
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

dashboard.get("/dashboards", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const [dashboards] = await db.query(`
            SELECT id, title, is_public, owner, cover_image, created_at, updated_at
            FROM dashboard 
            WHERE owner = type::thing('user', $userId)
            ORDER BY updated_at DESC;
        `, { userId });
        return c.json({ dashboards })
    } catch (e) {
        return c.json({ error: "Failed to fetch dashboards" }, 500)
    }
})

dashboard.post("/dashboards", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload);
        const [userData] = await db.query(`SELECT subscription_tier FROM type::thing('user', $userId)`, { userId })
        const tier = userData?.[0]?.subscription_tier || 'free'
        const limitCheck = await canCreateDashboard(db, userId, tier)
        if (!limitCheck.allowed) {
            return c.json({ error: limitCheck.message, upgradeRequired: true }, 403)
        }
        const { title, data } = await c.req.json()
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

        if (!created || !created[0]) throw new Error("Failed to create dashboard");
        return c.json({ id: created[0].id })
    } catch (e) {
        console.error("[Dashboard] Create error:", e);
        return c.json({ error: "Failed to create dashboard: " + e.message }, 500)
    }
})

dashboard.get("/dashboards/shared", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
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
            WHERE user = type::thing('user', $user)
            ORDER BY created_at DESC;
        `, { user: userId });

        const sharedDashboards = results.map(item => ({
            id: item.id,
            title: item.title,
            cover_image: item.cover_image,
            updated_at: item.updated_at,
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
        return c.json({ error: "Failed to fetch shared dashboards" }, 500)
    }
})

dashboard.get("/dashboards/recent", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Query dashboards through the 'accessed' relationship
        const [results] = await db.query(`
            SELECT 
                accessed_at,
                out.id as id,
                out.title as title,
                out.owner as owner_id,
                out.cover_image as cover_image,
                out.updated_at as updated_at,
                out.is_public as is_public,
                (out.owner = type::thing('user', $userId)) as is_owner
            FROM accessed 
            WHERE in = type::thing('user', $userId)
            ORDER BY accessed_at DESC 
            LIMIT 12;
        `, { userId });

        // Fetch shared roles for recent dashboards that the user doesn't own
        const dashboards = await Promise.all(results.map(async (item) => {
            let role = item.is_owner ? 'owner' : null;

            if (!role) {
                const [permCheck] = await db.query(`
                    SELECT role FROM dashboard_permission 
                    WHERE dashboard = $dashId 
                    AND user = type::thing('user', $userId) 
                    LIMIT 1;
                `, { dashId: item.id, userId });
                role = permCheck?.[0]?.role || (item.is_public ? 'viewer' : 'none');
            }

            return {
                id: item.id.toString().split(':')[1] || item.id,
                title: item.title,
                cover_image: item.cover_image,
                updated_at: item.updated_at,
                accessed_at: item.accessed_at,
                access_role: role,
                is_owner: item.is_owner
            };
        }));

        return c.json({ dashboards })
    } catch (e) {
        console.error("[Recent] Error:", e);
        return c.json({ error: "Failed to fetch recent dashboards" }, 500)
    }
})

dashboard.post("/dashboards/:id/access", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        // Record the access using a RELATE statement (creates or updates)
        await db.query(`
            RELATE type::thing('user', $userId)->accessed->${id} 
            SET accessed_at = time::now();
        `, { userId });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to track access" }, 500)
    }
})

dashboard.get("/dashboards/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const [result] = await db.query(`
            SELECT *,
                (owner = type::thing('user', $userId)) as is_owner,
                (SELECT role FROM dashboard_permission WHERE user = type::thing('user', $userId) AND dashboard = $parent.id)[0] as permission_role
            FROM ${id};
        `, { userId });

        if (!result || result.length === 0) return c.json({ error: "Dashboard not found" }, 404)
        const dashboard = result[0]

        let role = null;
        if (dashboard.is_owner) role = 'owner';
        else if (dashboard.permission_role) role = dashboard.permission_role;

        if (!role && !dashboard.is_public) return c.json({ error: "Unauthorized" }, 403)

        const cleanId = (rid) => rid.toString().split(':')[1] || rid.toString();
        let elements = dashboard.data?.elements || [];

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
        return c.json({ dashboard: responseDashboard })
    } catch (e) {
        return c.json({ error: "Failed to fetch dashboard" }, 500)
    }
})

dashboard.put("/dashboards/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`
        const { title, data } = await c.req.json()

        // 1. Check Permissions First (Two-step is more stable in SurrealDB JS)
        const role = await getDashboardRole(userId, id);
        if (role !== 'owner' && role !== 'editor' && role !== 'write') {
            return c.json({ error: "Unauthorized access or insufficient permissions" }, 403)
        }

        const updates = []
        const params = { userId, id }
        if (title) { updates.push('title = $title'); params.title = title; }
        if (data?.cover_image !== undefined) { updates.push('cover_image = $cover_image'); params.cover_image = data.cover_image; }
        if (data) { updates.push('data = $data'); params.data = data; }
        updates.push('updated_at = time::now()')

        if (updates.length > 1) { // More than just updated_at
            const query = `UPDATE ${id} SET ${updates.join(', ')}`;
            await db.query(query, params);
        }

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Dashboard] Update error:", e);
        return c.json({ error: "Failed to update dashboard: " + e.message }, 500)
    }
})

dashboard.post("/dashboards/:id/share", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const [existing] = await db.query(`SELECT share_token FROM ${id} WHERE owner = type::thing('user', $userId)`, { userId });
        let shareToken = (existing && existing[0]) ? existing[0].share_token : crypto.randomUUID();

        await db.query(`
            UPDATE ${id} SET share_token = $shareToken, is_public = true 
            WHERE owner = type::thing('user', $userId);
        `, { shareToken, userId });

        return c.json({ token: shareToken })
    } catch (e) {
        return c.json({ error: "Failed to share dashboard" }, 500)
    }
})

// Privacy
dashboard.put("/dashboards/:id/privacy", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`
        const { is_public } = await c.req.json()

        const [check] = await db.query(`SELECT 1 FROM ${id} WHERE owner = type::thing('user', $userId)`, { userId })
        if (!check || check.length === 0) return c.json({ error: "Only the owner can change privacy" }, 403)

        if (!is_public) {
            await db.query(`DELETE dashboard_permission WHERE dashboard = ${id};`)
            await db.query(`UPDATE ${id} SET is_public = false, share_token = NONE, updated_at = time::now() WHERE owner = type::thing('user', $userId);`, { userId })
        } else {
            await db.query(`UPDATE ${id} SET is_public = true, updated_at = time::now() WHERE owner = type::thing('user', $userId);`, { userId })
        }
        return c.json({ ok: true, is_public })
    } catch (e) {
        return c.json({ error: "Failed to update privacy" }, 500)
    }
})

dashboard.delete("/dashboards/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        await db.query(`DELETE ${id} WHERE owner = type::thing('user', $userId);`, { userId });

        const io = getIO();
        if (io) {
            const room = getRoom(id);
            io.to(room).emit('dashboard_deleted', { dashboardId: id });
            io.in(room).socketsLeave(room);
        }

        await db.query(`DELETE dashboard_element WHERE dashboard = ${id}`);
        await db.query(`DELETE dashboard_permission WHERE dashboard = ${id}`);
        await db.query(`DELETE dashboard_message WHERE dashboard = ${id}`);

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to delete dashboard" }, 500)
    }
})

// Unified Permission Management

dashboard.get("/dashboards/:id/permissions", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const currentRole = await getDashboardRole(userId, id);
        if (!currentRole) return c.json({ error: "Unauthorized" }, 403)

        const rawDashId = id.split(':')[1];

        // Fetch permissions with user_id for identification
        const [permissions] = await db.query(`
            SELECT 
                role as access_level,
                user as user_id,
                user.email as email,
                user.first_name as first_name,
                user.last_name as last_name,
                user.profile_picture_url as profile_picture_url,
                alias,
                created_at 
            FROM dashboard_permission 
            WHERE dashboard = type::thing('dashboard', $dashId);
        `, { dashId: rawDashId });

        // Fetch owner details
        const [ownerData] = await db.query(`
            SELECT 
                owner as id,
                owner.email as email,
                owner.first_name as first_name,
                owner.last_name as last_name,
                owner.profile_picture_url as profile_picture_url
            FROM type::thing('dashboard', $dashId)
        `, { dashId: rawDashId });

        // Map permissions to ensure IDs are strings
        const formattedPermissions = (permissions || []).map(p => ({
            ...p,
            user_id: p.user_id?.toString() || String(p.user_id)
        }));

        // Map owner to ensure ID is string
        const formattedOwner = ownerData?.[0] ? {
            ...ownerData[0],
            id: ownerData[0].id?.toString() || String(ownerData[0].id)
        } : null;

        return c.json({
            permissions: formattedPermissions,
            currentUserRole: currentRole,
            owner: formattedOwner
        })
    } catch (e) {
        console.error(`[Permissions] Error:`, e)
        return c.json({ error: "Failed to fetch permissions" }, 500)
    }
})

dashboard.post("/dashboards/:id/share/invite", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        const { email, role } = await c.req.json()
        if (!email) return c.json({ error: "Email required" }, 400)

        const currentRole = await getDashboardRole(userId, id);
        if (currentRole !== 'owner' && currentRole !== 'write') {
            return c.json({ error: "Only owners and editors can invite users" }, 403)
        }

        const [targetUser] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });
        if (!targetUser || !targetUser.length) {
            return c.json({ error: "User must log in once before being invited." }, 404)
        }

        const rawUserId = targetUser[0].id.toString().split(':')[1];
        const rawDashId = id.split(':')[1];

        await db.query(`
            LET $u = type::thing('user', $userId);
            LET $d = type::thing('dashboard', $dashId);
            INSERT INTO dashboard_permission (user, dashboard, role, created_at)
            VALUES ($u, $d, $role, time::now())
            ON DUPLICATE KEY UPDATE role = $role;
        `, { userId: rawUserId, dashId: rawDashId, role: role || 'read' });

        await notifyPermissionChange(email, id, role || 'read', 'invite');
        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to invite user" }, 500)
    }
})

dashboard.put("/dashboards/:id/permissions/:email", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const email = decodeURIComponent(c.req.param("email"))
        const { role, alias } = await c.req.json()
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log(`[Permissions] PUT request for: ${email} on dashboard: ${id}`);

        const currentRole = await getDashboardRole(userId, id);
        if (currentRole !== 'owner' && currentRole !== 'write') return c.json({ error: "Unauthorized" }, 403)

        // Identify target user by email or raw ID
        let rawTargetId = null;
        const [userCheck] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });

        if (userCheck && userCheck.length > 0) {
            rawTargetId = userCheck[0].id.toString().split(':')[1];
        } else if (email.includes('user')) {
            // Extract ID from strings like "user:abc" or "user_abc" or just use "abc"
            rawTargetId = email.includes(':') ? email.split(':')[1] : (email.includes('_') ? email.split('_')[1] : email);
        } else {
            // Assume the passed parameter is the raw ID
            rawTargetId = email;
        }

        if (!rawTargetId) {
            console.warn(`[Permissions] Could not find user to update: ${email}`);
            return c.json({ error: "User not found" }, 404)
        }

        const rawDashId = id.split(':')[1];
        console.log(`[Permissions] Updating user:${rawTargetId} on dashboard:${rawDashId}`);

        await db.query(`
            UPDATE dashboard_permission 
            SET role = $role, alias = $alias
            WHERE user = type::thing('user', $targetId) 
            AND dashboard = type::thing('dashboard', $dashId);
        `, { role: role || 'read', alias: alias || null, targetId: rawTargetId, dashId: rawDashId });

        await notifyPermissionChange(email.includes('user') ? null : email, id, role || 'read', 'update');
        return c.json({ ok: true })
    } catch (e) {
        console.error(`[Permissions] PUT Error:`, e);
        return c.json({ error: "Failed to update permission: " + e.message }, 500)
    }
})

dashboard.delete("/dashboards/:id/permissions/:email", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const email = decodeURIComponent(c.req.param("email"))
        if (!id.includes(':')) id = `dashboard:${id}`

        console.log(`[Permissions] DELETE request for: ${email} on dashboard: ${id}`);

        const currentRole = await getDashboardRole(userId, id);
        if (currentRole !== 'owner' && currentRole !== 'write') return c.json({ error: "Unauthorized" }, 403)

        // Try to resolve target user by email or raw string
        let rawTargetId = null;
        const [userCheck] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });

        if (userCheck && userCheck.length > 0) {
            rawTargetId = userCheck[0].id.toString().split(':')[1];
        } else if (email.includes('user')) {
            // Extract ID from strings like "user:abc" or "user_abc" or just use "abc"
            rawTargetId = email.includes(':') ? email.split(':')[1] : (email.includes('_') ? email.split('_')[1] : email);
        } else {
            // Assume the passed parameter is the raw ID
            rawTargetId = email;
        }

        if (!rawTargetId) {
            console.warn(`[Permissions] Could not identify user to remove: ${email}`);
            return c.json({ error: "Could not identify user to remove" }, 404)
        }

        const rawDashId = id.split(':')[1];
        console.log(`[Permissions] Removing user:${rawTargetId} from dashboard:${rawDashId}`);

        await db.query(`
            DELETE FROM dashboard_permission 
            WHERE user = type::thing('user', $targetId) 
            AND dashboard = type::thing('dashboard', $dashId);
        `, { targetId: rawTargetId, dashId: rawDashId });

        await notifyPermissionChange(email.includes('user') ? null : email, id, 'none', 'remove');
        return c.json({ ok: true })
    } catch (e) {
        console.error(`[Permissions] DELETE Error:`, e);
        return c.json({ error: "Failed to delete permission: " + e.message }, 500)
    }
})

// Public Share
dashboard.get("/shared/dashboard/:token", async (c) => {
    try {
        const token = c.req.param("token")
        const [rs] = await db.query(`SELECT * FROM dashboard WHERE share_token = $token AND is_public = true;`, { token });
        if (!rs || !rs[0]) return c.json({ error: "Not found" }, 404)
        const dashboard = rs[0];
        const [elements] = await db.query(`SELECT * FROM dashboard_element WHERE dashboard = $id`, { id: dashboard.id });
        const layout = elements.map(el => el.ui_layout ? { ...el.ui_layout, i: el.id } : { i: el.id, x: 0, y: 0, w: 2, h: 2 });
        return c.json({ dashboard: { ...dashboard, data: { layout, elements } } })
    } catch (e) {
        return c.json({ error: "Failed" }, 500)
    }
})

// Files
dashboard.post("/dashboards/:dashboardId/files", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const dashboardId = c.req.param("dashboardId")
        const fullDashboardId = dashboardId.includes(':') ? dashboardId : `dashboard:${dashboardId}`
        const formData = await c.req.formData()
        const file = formData.get('file')
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400)
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const fileId = crypto.randomUUID()
        await db.query(`
            CREATE type::thing('dashboard_file', $fileId) CONTENT {
                dashboard: ${fullDashboardId},
                file_name: $fileName,
                file_size: $fileSize,
                file_type: $fileType,
                file_data: $fileData,
                uploaded_by: type::thing('user', $userId),
                created_at: time::now()
            };
        `, { fileId, fileName: file.name, fileSize: file.size, fileType: file.type, fileData: base64, userId });
        return c.json({ fileId })
    } catch (e) {
        return c.json({ error: "Failed" }, 500)
    }
})

dashboard.get("/files/:fileId", async (c) => {
    try {
        const fileId = c.req.param("fileId")
        const [result] = await db.query(`SELECT * FROM type::thing('dashboard_file', $fileId);`, { fileId })
        if (!result || result.length === 0) return c.json({ error: "Not found" }, 404)
        const fileRecord = result[0]
        const buffer = Buffer.from(fileRecord.file_data, 'base64')
        return new Response(buffer, {
            headers: {
                'Content-Type': fileRecord.file_type || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${fileRecord.file_name}"`,
                'Content-Length': buffer.length.toString()
            }
        })
    } catch (e) {
        return c.json({ error: "Failed" }, 500)
    }
})

export { dashboard as dashboardRoutes }
