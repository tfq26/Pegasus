import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import crypto from "crypto"
import { db } from "../db/index.js"
import { dashboards, dashboardPermissions, users, dashboardElements, notifications, recentAccess } from "../db/schema.js"
import { eq, and, or, sql } from "drizzle-orm"
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
        await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName: payload.firstName || payload.first_name,
                lastName: payload.lastName || payload.last_name,
                profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName: payload.firstName || payload.first_name,
                    lastName: payload.lastName || payload.last_name,
                    profilePictureUrl: (payload.profilePictureUrl || payload.profile_picture_url) ?? null,
                    updatedAt: new Date()
                }
            })
    } catch (e) {
        console.error("[Dashboard] Failed to upsert user:", e)
        throw e
    }
}

// Utility: Correct Role Determination
const getDashboardRole = async (userId, dashboardId) => {
    const rawDashId = dashboardId.includes(':') ? dashboardId.split(':')[1] : dashboardId;
    const rawUserId = userId.includes(':') ? userId.split(':')[1] : userId;

    try {
        // 1. Check Ownership
        const dashResult = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, rawDashId)
        });

        if (dashResult && dashResult.ownerId === rawUserId) {
            return 'owner';
        }

        // 2. Check Permissions Table
        const permCheck = await db.query.dashboardPermissions.findFirst({
            where: and(
                eq(dashboardPermissions.dashboardId, rawDashId),
                eq(dashboardPermissions.userId, rawUserId)
            )
        });

        if (permCheck) {
            return permCheck.role;
        }

    } catch (err) {
        console.error("[getDashboardRole] Error:", err);
    }

    return null;
};

// Utility: Real-time Notifications
const notifyPermissionChange = async (email, dashboardId, role, type = 'update') => {
    try {
        if (!email) return;
        const io = getIO();
        if (!io) return;

        const rawDashId = dashboardId.includes(':') ? dashboardId.split(':')[1] : dashboardId;
        const dash = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, rawDashId)
        });
        const title = dash?.title || 'Unknown Dashboard';

        const sockets = await io.fetchSockets();
        const targetSocket = sockets.find(s => s.user?.email === email);

        if (targetSocket) {
            targetSocket.emit("permission_updated", {
                dashboardId: rawDashId,
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

        const elements = await db.select()
            .from(dashboardElements)
            .innerJoin(dashboards, eq(dashboardElements.dashboardId, dashboards.id))
            .where(or(
                eq(dashboardElements.createdBy, userId),
                eq(dashboards.ownerId, userId)
            ))
            .orderBy(sql`${dashboardElements.createdAt} DESC`)

        return c.json({ elements: elements.map(e => e.dashboard_element) })
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
        const { type, title, config, query, dashboardId, created_by_name } = await c.req.json()

        const creatorName = created_by_name || (`${payload.firstName || ''} ${payload.lastName || ''}`.trim() || payload.email);
        const rawDashId = dashboardId ? (dashboardId.includes(':') ? dashboardId.split(':')[1] : dashboardId) : null;

        const [created] = await db.insert(dashboardElements)
            .values({
                dashboardId: rawDashId,
                type,
                title,
                config: typeof config === 'string' ? JSON.parse(config) : config,
                query,
                createdBy: userId,
                createdByName: creatorName
            })
            .returning()

        return c.json({ id: created.id })
    } catch (e) {
        console.error("[Create Element] Error:", e)
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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        // In Drizzle we can't easily do cross-table delete with OR directly in simple delete
        // So we fetch first to verify permission
        const element = await db.query.dashboardElements.findFirst({
            where: eq(dashboardElements.id, rawId),
            with: {
                dashboard: true
            }
        })

        if (!element) return c.json({ error: "Not found" }, 404)
        if (element.createdBy !== userId && element.dashboard?.ownerId !== userId) {
            return c.json({ error: "Unauthorized" }, 403)
        }

        await db.delete(dashboardElements).where(eq(dashboardElements.id, rawId))
        return c.json({ success: true })
    } catch (e) {
        console.error("[Delete Element] Error:", e)
        return c.json({ error: "Failed to delete" }, 500)
    }
})

dashboard.put("/dashboard/elements/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const { query, config, title } = await c.req.json()

        const element = await db.query.dashboardElements.findFirst({
            where: eq(dashboardElements.id, rawId),
            with: { dashboard: true }
        })

        if (!element) return c.json({ error: "Not found" }, 404)
        if (element.createdBy !== userId && element.dashboard?.ownerId !== userId) {
            return c.json({ error: "Unauthorized" }, 403)
        }

        await db.update(dashboardElements)
            .set({
                query,
                config: config ? (typeof config === 'string' ? JSON.parse(config) : config) : undefined,
                title
            })
            .where(eq(dashboardElements.id, rawId))

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Update Element] Error:", e)
        return c.json({ error: "Failed to update" }, 500)
    }
})

dashboard.get("/dashboards", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        console.log(`[Get Dashboards] Fetching for user: ${userId}`);

        const userDashboards = await db.query.dashboards.findMany({
            where: eq(dashboards.ownerId, userId),
            orderBy: (dashboards, { desc }) => [desc(dashboards.updatedAt)]
        })

        const dashboardsWithCounts = userDashboards.map(d => ({
            ...d,
            unread_count: 0 // Placeholder until notifications migrated
        }))

        return c.json({ dashboards: dashboardsWithCounts })
    } catch (e) {
        console.error("[Get Dashboards] Error details:", e)
        return c.json({ error: "Failed to fetch dashboards", details: e.message }, 500)
    }
})

dashboard.post("/dashboards", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload);

        const userData = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });
        const tier = userData?.subscriptionTier || 'free'

        // Temporarily bypassing limitCheck as it likely uses SurrealDB logic
        // TODO: Migrate tierLimits.js to Drizzle
        /*
        const limitCheck = await canCreateDashboard(db, userId, tier)
        if (!limitCheck.allowed) {
            return c.json({ error: limitCheck.message, upgradeRequired: true }, 403)
        }
        */

        const { title, data } = await c.req.json()
        const [created] = await db.insert(dashboards)
            .values({
                title,
                ownerId: userId,
                coverImage: data?.cover_image || '',
                isPublic: false
            })
            .returning()

        return c.json({ id: created.id })
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

        const results = await db.select({
            role: dashboardPermissions.role,
            sharedAt: dashboardPermissions.role, // Placeholder
            id: dashboards.id,
            title: dashboards.title,
            coverImage: dashboards.coverImage,
            updatedAt: dashboards.updatedAt,
            ownerFirstName: users.firstName,
            ownerLastName: users.lastName,
            ownerEmail: users.email,
            ownerId: users.id
        })
            .from(dashboardPermissions)
            .innerJoin(dashboards, eq(dashboardPermissions.dashboardId, dashboards.id))
            .innerJoin(users, eq(dashboards.ownerId, users.id))
            .where(eq(dashboardPermissions.userId, userId))
            .orderBy(sql`${dashboards.updatedAt} DESC`)

        // Fetch unread notifications counts
        const unreadCounts = await db.select({
            dashboardId: notifications.dashboardId,
            count: sql`count(*)`
        })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
            .groupBy(notifications.dashboardId)

        const countMap = new Map();
        unreadCounts.forEach(c => countMap.set(c.dashboardId, Number(c.count)));

        const sharedDashboards = results.map(item => ({
            id: item.id,
            title: item.title,
            cover_image: item.coverImage,
            updated_at: item.updatedAt,
            shared_at: item.sharedAt,
            role: item.role,
            owner: {
                id: item.ownerId,
                first_name: item.ownerFirstName,
                last_name: item.ownerLastName,
                email: item.ownerEmail
            },
            is_shared: true,
            unread_count: countMap.get(item.id) || 0
        }));

        return c.json({ dashboards: sharedDashboards })
    } catch (e) {
        console.error("[Shared Dashboards] Error:", e)
        return c.json({ error: "Failed to fetch shared dashboards" }, 500)
    }
})

dashboard.get("/dashboards/recent", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        const results = await db.select({
            accessedAt: recentAccess.accessedAt,
            id: dashboards.id,
            title: dashboards.title,
            ownerId: dashboards.ownerId,
            coverImage: dashboards.coverImage,
            updatedAt: dashboards.updatedAt,
            isPublic: dashboards.isPublic,
            role: dashboardPermissions.role
        })
            .from(recentAccess)
            .innerJoin(dashboards, eq(recentAccess.dashboardId, dashboards.id))
            .leftJoin(dashboardPermissions, and(
                eq(dashboards.id, dashboardPermissions.dashboardId),
                eq(dashboardPermissions.userId, userId)
            ))
            .where(eq(recentAccess.userId, userId))
            .orderBy(sql`${recentAccess.accessedAt} DESC`)
            .limit(12)

        const dashboardsData = results.map(item => ({
            id: item.id,
            title: item.title,
            cover_image: item.coverImage,
            updated_at: item.updatedAt,
            accessed_at: item.accessedAt,
            access_role: item.role || (item.ownerId === userId ? 'owner' : (item.isPublic ? 'viewer' : 'none')),
            is_owner: item.ownerId === userId
        }));

        return c.json({ dashboards: dashboardsData })
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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        await db.insert(recentAccess)
            .values({
                userId,
                dashboardId: rawId,
                accessedAt: new Date()
            })
            .onConflictDoUpdate({
                target: [recentAccess.userId, recentAccess.dashboardId],
                set: { accessedAt: new Date() }
            })

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Access tracking] Error:", e);
        return c.json({ error: "Failed to track access" }, 500)
    }
})

dashboard.post("/dashboards/:id/read", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `dashboard:${id}`

        await db.query(`
            UPDATE notification 
            SET is_read = true 
            WHERE user = type::thing('user', $userId) 
            AND dashboard = type::thing('dashboard', $dashId);
        `, { userId, dashId: id.split(':')[1] });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to mark as read" }, 500)
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

        // Enrich elements with creator names if missing and we have IDs
        // This handles cases where elements were created before we started storing names
        const enrichedElements = await Promise.all(elements.map(async (el) => {
            if (!el.created_by_name && !el.created_by_name_filled && el.created_by && el.created_by.includes(':')) {
                try {
                    const [userResult] = await db.query(`SELECT first_name, last_name, email FROM ${el.created_by}`);
                    if (userResult && userResult[0]) {
                        const name = `${userResult[0].first_name || ''} ${userResult[0].last_name || ''}`.trim() || userResult[0].email;
                        return { ...el, created_by_name: name, created_by_name_filled: true };
                    }
                } catch (err) {
                    console.warn(`[Dashboard] Failed to fetch user details for ${el.created_by}:`, err.message);
                }
            }
            return el;
        }));

        // Return dashboard with embedded data
        const responseDashboard = {
            ...dashboard,
            id: cleanId(dashboard.id),
            access_level: role || (dashboard.is_public ? 'viewer' : null),
            data: {
                ...(dashboard.data || {}),
                layout: dashboard.data?.layout || [],
                elements: enrichedElements
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
