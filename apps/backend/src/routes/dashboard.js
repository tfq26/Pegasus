import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { WorkOS } from "@workos-inc/node"
import crypto from "crypto"
import { db } from "../db/index.js"
import { dashboards, dashboardPermissions, users, dashboardElements, notifications, recentAccess, files, spaceFiles, dataSpaces } from "../db/schema.js"
import { eq, and, or, sql, desc } from "drizzle-orm"
import { SecretService } from "../services/SecretService.js"
import { canCreateDashboard } from "../../lib/tierLimits.js"
import { getIO, getRoom } from "../socket.js"

import { ConfigService } from "../services/ConfigService.js"
import { StorageManager } from "../services/storage/StorageManager.js"
import { SnapshotService } from "../services/SnapshotService.js"

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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        await db.update(notifications)
            .set({ isRead: true })
            .where(and(
                eq(notifications.userId, userId),
                eq(notifications.dashboardId, rawId)
            ));

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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        // 1. Fetch Dashboard Metadata (Drizzle)
        const dashboard = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, rawId),
            with: {
                permissions: true,
                owner: true
            }
        });

        if (!dashboard) return c.json({ error: "Dashboard not found" }, 404)

        // 2. Check Permissions
        let role = null;
        if (dashboard.ownerId === userId) {
            role = 'owner';
        } else {
            // Check direct permission in the 'permissions' relation
            const perm = dashboard.permissions.find(p => p.userId === userId);
            if (perm) role = perm.role;
        }

        if (!role && !dashboard.isPublic) return c.json({ error: "Unauthorized" }, 403)

        // Check for share token expiry if relying on public access
        if (!role && dashboard.isPublic && dashboard.shareTokenExpiresAt && new Date() > new Date(dashboard.shareTokenExpiresAt)) {
            return c.json({ error: "Share link has expired" }, 403)
        }

        // 3. Hybrid Storage Resolution
        let fullConfig = dashboard.config || {};

        if (dashboard.storageId) {
            try {
                // Offloaded to Storage. Fetch it.
                // We use the Owner's provider context for the dashboard file
                const provider = await StorageManager.getProvider(dashboard.ownerId);
                const url = await provider.getPresignedUrl(dashboard.storageId, 60); // 60s is enough for backend to fetch

                const response = await fetch(url);
                if (response.ok) {
                    const storageData = await response.json();
                    // Merge storage data (priority)
                    fullConfig = { ...fullConfig, ...storageData };
                } else {
                    console.error(`[Dashboard] Failed to fetch storage content: ${response.statusText}`);
                }
            } catch (err) {
                console.error(`[Dashboard] Storage fetch error for ${dashboard.id}:`, err);
                // Fallback to existing config if possible, or partial load
            }
        }

        // 4. Construct Response (Legacy Shape Compatibility)
        // Frontend expects 'data' property with layout/elements
        const responseDashboard = {
            id: dashboard.id,
            title: dashboard.title,
            cover_image: dashboard.coverImage,
            is_public: dashboard.isPublic,
            updated_at: dashboard.updatedAt,
            owner_id: dashboard.ownerId,
            access_level: role || (dashboard.isPublic ? 'viewer' : null),
            is_owner: dashboard.ownerId === userId,
            data: fullConfig // Map 'config' to 'data' for frontend compatibility
        };

        return c.json({ dashboard: responseDashboard })
    } catch (e) {
        console.error("[Get Dashboard] Error:", e);
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
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const { title, data } = await c.req.json()

        // 1. Check Permissions
        const role = await getDashboardRole(userId, rawId);
        if (role !== 'owner' && role !== 'editor' && role !== 'write') {
            return c.json({ error: "Unauthorized access or insufficient permissions" }, 403)
        }

        const updates = { updatedAt: new Date() };
        if (title) updates.title = title;
        if (data?.cover_image !== undefined) updates.coverImage = data.cover_image;

        // 2. Hybrid Storage Offloading
        if (data) {
            // Upload 'data' to Storage
            const provider = await StorageManager.getProvider(userId);
            const key = `dashboards/${rawId}/data.json`;
            const content = JSON.stringify(data);

            await provider.upload(key, content, 'application/json');

            updates.storageId = key;
            updates.config = null; // Clear local config to save space
        }

        if (data?.snapshot_config) {
            updates.snapshotConfig = data.snapshot_config;
        }

        // 3. Update Database
        await db.update(dashboards)
            .set(updates)
            .where(eq(dashboards.id, rawId));

        // 4. Trigger Snapshot if Configured ('on_save')
        // We fetch the latest config to check rule if not passed
        const snapshotConfig = data?.snapshot_config || (await db.query.dashboards.findFirst({
            where: eq(dashboards.id, rawId),
            columns: { snapshotConfig: true }
        }))?.snapshotConfig;

        if (snapshotConfig?.mode === 'on_save') {
            // Run asynchronously to not block response
            SnapshotService.createDashboardSnapshot(rawId, 'save').catch(err => console.error("Async snapshot failed", err));
        }

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Dashboard] Update error:", e);
        return c.json({ error: "Failed to update dashboard: " + e.message }, 500)
    }
})

dashboard.post("/dashboards/:id/snapshot", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const rawId = id.includes(':') ? id.split(':')[1] : id

        // Check permissions
        const role = await getDashboardRole(userId, rawId);
        if (role !== 'owner' && role !== 'editor') {
            return c.json({ error: "Unauthorized" }, 403)
        }

        // Trigger Snapshot
        const result = await SnapshotService.createDashboardSnapshot(rawId, 'manual');
        return c.json(result);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
})

dashboard.post("/dashboards/:id/share", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const { expiresIn } = await c.req.json().catch(() => ({}))

        const dash = await db.query.dashboards.findFirst({
            where: and(eq(dashboards.id, rawId), eq(dashboards.ownerId, userId))
        });

        if (!dash) return c.json({ error: "Unauthorized" }, 403);

        let shareToken = dash.shareToken || crypto.randomUUID();
        let expiresAt = null;

        if (expiresIn) {
            // expiresIn in seconds
            expiresAt = new Date(Date.now() + expiresIn * 1000);
        }

        await db.update(dashboards)
            .set({
                shareToken,
                isPublic: true,
                shareTokenExpiresAt: expiresAt
            })
            .where(eq(dashboards.id, rawId));

        return c.json({ token: shareToken, expiresAt })
    } catch (e) {
        console.error("[Share] Error:", e);
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
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const { is_public } = await c.req.json()

        const dash = await db.query.dashboards.findFirst({
            where: and(eq(dashboards.id, rawId), eq(dashboards.ownerId, userId))
        })
        if (!dash) return c.json({ error: "Only the owner can change privacy" }, 403)

        if (!is_public) {
            await db.delete(dashboardPermissions).where(eq(dashboardPermissions.dashboardId, rawId));
            await db.update(dashboards)
                .set({ isPublic: false, shareToken: null, updatedAt: new Date() })
                .where(eq(dashboards.id, rawId));
        } else {
            await db.update(dashboards)
                .set({ isPublic: true, updatedAt: new Date() })
                .where(eq(dashboards.id, rawId));
        }
        return c.json({ ok: true, is_public })
    } catch (e) {
        console.error("[Privacy] Error:", e);
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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const dash = await db.query.dashboards.findFirst({
            where: and(eq(dashboards.id, rawId), eq(dashboards.ownerId, userId))
        });

        if (!dash) return c.json({ error: "Unauthorized" }, 403);

        await db.delete(dashboards).where(eq(dashboards.id, rawId));

        const io = getIO();
        if (io) {
            const room = getRoom(rawId);
            io.to(room).emit('dashboard_deleted', { dashboardId: rawId });
            io.in(room).socketsLeave(room);
        }

        // Drizzle cascade handles element and permission deletion if defined in schema, 
        // but we explicitly clean up others if needed.
        await db.delete(dashboardElements).where(eq(dashboardElements.dashboardId, rawId));
        await db.delete(dashboardPermissions).where(eq(dashboardPermissions.dashboardId, rawId));
        await db.delete(notifications).where(eq(notifications.dashboardId, rawId));

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Delete Dashboard] Error:", e);
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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const currentRole = await getDashboardRole(userId, rawId);
        if (!currentRole) return c.json({ error: "Unauthorized" }, 403)

        // Fetch permissions with users
        const permissions = await db.query.dashboardPermissions.findMany({
            where: eq(dashboardPermissions.dashboardId, rawId),
            with: {
                user: true
            }
        });

        // Fetch dashboard owner
        const dash = await db.query.dashboards.findFirst({
            where: eq(dashboards.id, rawId),
            with: {
                owner: true
            }
        });

        const formattedPermissions = permissions.map(p => ({
            access_level: p.role,
            user_id: p.userId,
            email: p.user.email,
            first_name: p.user.firstName,
            last_name: p.user.lastName,
            profile_picture_url: p.user.profilePictureUrl,
            created_at: p.createdAt || new Date() // Placeholder if not in schema
        }));

        const formattedOwner = dash?.owner ? {
            id: dash.owner.id,
            email: dash.owner.email,
            first_name: dash.owner.firstName,
            last_name: dash.owner.lastName,
            profile_picture_url: dash.owner.profilePictureUrl
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
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const { email, role } = await c.req.json()
        if (!email) return c.json({ error: "Email required" }, 400)

        const currentRole = await getDashboardRole(userId, rawId);
        if (currentRole !== 'owner' && currentRole !== 'write') {
            return c.json({ error: "Only owners and editors can invite users" }, 403)
        }

        const targetUser = await db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (!targetUser) {
            return c.json({ error: "User must log in once before being invited." }, 404)
        }

        await db.insert(dashboardPermissions)
            .values({
                userId: targetUser.id,
                dashboardId: rawId,
                role: role || 'read'
            })
            .onConflictDoUpdate({
                target: [dashboardPermissions.userId, dashboardPermissions.dashboardId],
                set: { role: role || 'read' }
            });

        await notifyPermissionChange(email, rawId, role || 'read', 'invite');
        return c.json({ ok: true })
    } catch (e) {
        console.error("[Invite] Error:", e);
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
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const email = decodeURIComponent(c.req.param("email"))
        const { role, alias } = await c.req.json()

        const currentRole = await getDashboardRole(userId, rawId);
        if (currentRole !== 'owner' && currentRole !== 'write') return c.json({ error: "Unauthorized" }, 403)

        const targetUser = await db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (!targetUser) {
            return c.json({ error: "User not found" }, 404)
        }

        await db.update(dashboardPermissions)
            .set({ role: role || 'read' })
            .where(and(
                eq(dashboardPermissions.dashboardId, rawId),
                eq(dashboardPermissions.userId, targetUser.id)
            ));

        await notifyPermissionChange(email, rawId, role || 'read', 'update');
        return c.json({ ok: true })
    } catch (e) {
        console.error(`[Permissions] PUT Error:`, e);
        return c.json({ error: "Failed to update permission" }, 500)
    }
})

dashboard.delete("/dashboards/:id/permissions/:email", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const email = decodeURIComponent(c.req.param("email"))

        const currentRole = await getDashboardRole(userId, rawId);
        if (currentRole !== 'owner' && currentRole !== 'write') return c.json({ error: "Unauthorized" }, 403)

        const targetUser = await db.query.users.findFirst({
            where: eq(users.email, email)
        });

        if (!targetUser) {
            return c.json({ error: "User not found" }, 404)
        }

        await db.delete(dashboardPermissions)
            .where(and(
                eq(dashboardPermissions.dashboardId, rawId),
                eq(dashboardPermissions.userId, targetUser.id)
            ));

        await notifyPermissionChange(email, rawId, 'none', 'remove');
        return c.json({ ok: true })
    } catch (e) {
        console.error(`[Permissions] DELETE Error:`, e);
        return c.json({ error: "Failed to delete permission" }, 500)
    }
})

// Public Share
dashboard.get("/shared/dashboard/:token", async (c) => {
    try {
        const token = c.req.param("token")
        const dash = await db.query.dashboards.findFirst({
            where: and(eq(dashboards.shareToken, token), eq(dashboards.isPublic, true))
        });
        if (!dash) return c.json({ error: "Not found" }, 404)

        const elements = await db.query.dashboardElements.findMany({
            where: eq(dashboardElements.dashboardId, dash.id)
        });

        const layout = elements.map(el => el.config?.ui_layout ? { ...el.config.ui_layout, i: el.id } : { i: el.id, x: 0, y: 0, w: 2, h: 2 });
        return c.json({ dashboard: { ...dash, data: { layout, elements } } })
    } catch (e) {
        console.error("[Shared Dashboard] Error:", e);
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
        const rawDashId = dashboardId.includes(':') ? dashboardId.split(':')[1] : dashboardId
        const formData = await c.req.formData()
        const file = formData.get('file')
        if (!file || !(file instanceof File)) return c.json({ error: "No file" }, 400)

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const fileId = crypto.randomUUID()

        // Use StorageManager to upload
        const provider = await StorageManager.getProvider(userId);
        const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `dashboards/${rawDashId}/files/${fileId}-${safeFilename}`;

        const result = await provider.upload(key, buffer, file.type);

        // Record in DB (files table)
        const [record] = await db.insert(files).values({
            id: fileId,
            userId,
            storageId: result.key,
            filename: file.name,
            size: file.size,
            mimeType: file.type,
            provider: provider.providerType || 'default'
        }).returning();

        return c.json({
            fileId: record.id,
            fileName: record.filename,
            fileSize: record.size,
            fileType: record.mimeType
        })
    } catch (e) {
        console.error("[Dashboard File Upload] Error:", e);
        return c.json({ error: "Failed to upload file" }, 500)
    }
})

dashboard.get("/files/:fileId", async (c) => {
    try {
        const fileId = c.req.param("fileId")
        const rawFileId = fileId.includes(':') ? fileId.split(':')[1] : fileId

        let file = await db.query.files.findFirst({
            where: eq(files.id, rawFileId)
        });

        if (file) {
            const provider = await StorageManager.getProvider(file.userId, file.provider);
            const url = await provider.getPresignedUrl(file.storageId, 3600);
            return c.redirect(url);
        }

        // Fallback: Check space_files
        const spaceFileRow = await db.select().from(spaceFiles)
            .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
            .where(eq(spaceFiles.id, rawFileId))
            .limit(1);

        const spaceFile = spaceFileRow[0];

        if (!spaceFile) return c.json({ error: "File not found" }, 404)

        // Use space owner's provider
        const ownerId = spaceFile.data_space.userId;
        const provider = await StorageManager.getProvider(ownerId);

        // spaceFiles schema uses 'storagePath' typically, but some logic might use storageId alias
        const storageKey = spaceFile.space_file.storagePath || spaceFile.space_file.storageId;
        const url = await provider.getPresignedUrl(storageKey, 3600);

        return c.redirect(url);
    } catch (e) {
        console.error("[Dashboard File Download] Error:", e);
        return c.json({ error: "Failed to download file" }, 500)
    }
})

export { dashboard as dashboardRoutes }
