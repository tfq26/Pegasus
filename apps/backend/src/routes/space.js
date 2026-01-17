import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { dataSpaces, spacePermissions, users, connections, spaceSources, spaceFiles, spaceNotes } from "../db/schema.js"
import { eq, and, or, sql } from "drizzle-orm"
import { ConfigService } from "../services/ConfigService.js"

const spaces = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Utility: Correct Role Determination
const getSpaceRole = async (userId, spaceId) => {
    const rawSpaceId = spaceId.includes(':') ? spaceId.split(':')[1] : spaceId;
    const rawUserId = userId.includes(':') ? userId.split(':')[1] : userId;

    try {
        // 1. Check Ownership
        const space = await db.query.dataSpaces.findFirst({
            where: eq(dataSpaces.id, rawSpaceId)
        });

        if (space && space.userId === rawUserId) {
            return 'owner';
        }

        // 2. Check Permissions Table
        const permCheck = await db.query.spacePermissions.findFirst({
            where: and(
                eq(spacePermissions.spaceId, rawSpaceId),
                eq(spacePermissions.userId, rawUserId)
            )
        });

        if (permCheck) {
            return permCheck.role;
        }

    } catch (err) {
        console.error("[getSpaceRole] Error:", err);
    }

    return null;
};

spaces.get("/:id/permissions", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `data_space:${id}`

        const role = await getSpaceRole(userId, id);
        if (!role) return c.json({ error: "Unauthorized" }, 403)

        const currentPerms = await db.select({
            access_level: spacePermissions.role,
            user_id: spacePermissions.userId,
            email: users.email,
            first_name: users.firstName,
            last_name: users.lastName,
            profile_picture_url: users.profilePictureUrl
        })
            .from(spacePermissions)
            .innerJoin(users, eq(spacePermissions.userId, users.id))
            .where(eq(spacePermissions.spaceId, rawSpaceId))

        const ownerData = await db.select({
            id: users.id,
            email: users.email,
            first_name: users.firstName,
            last_name: users.lastName,
            profile_picture_url: users.profilePictureUrl
        })
            .from(users)
            .innerJoin(dataSpaces, eq(users.id, dataSpaces.userId))
            .where(eq(dataSpaces.id, rawSpaceId))

        return c.json({
            permissions: currentPerms || [],
            currentUserRole: role,
            owner: ownerData?.[0] || null
        })
    } catch (e) {
        console.error("[GET Permissions] Error:", e)
        return c.json({ error: "Failed to fetch permissions" }, 500)
    }
})

spaces.post("/:id/share/invite", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `data_space:${id}`

        const { email, role } = await c.req.json()
        if (!email) return c.json({ error: "Email required" }, 400)

        const currentRole = await getSpaceRole(userId, id);
        if (currentRole !== 'owner' && currentRole !== 'editor') {
            return c.json({ error: "Unauthorized" }, 403)
        }

        const targetUser = await db.query.users.findFirst({
            where: eq(users.email, email)
        })

        if (!targetUser) {
            return c.json({ error: "User not found. They must log in at least once." }, 404)
        }

        const rawSpaceId = id.split(':')[1];

        await db.insert(spacePermissions)
            .values({
                userId: targetUser.id,
                spaceId: rawSpaceId,
                role: role || 'viewer'
            })
            .onConflictDoUpdate({
                target: [spacePermissions.userId, spacePermissions.spaceId],
                set: { role: role || 'viewer' }
            })

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Invite] Error:", e)
        return c.json({ error: "Failed to invite user" }, 500)
    }
})

spaces.delete("/:id/permissions/:email", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const email = decodeURIComponent(c.req.param("email"))
        if (!id.includes(':')) id = `data_space:${id}`

        const currentRole = await getSpaceRole(userId, id);
        if (currentRole !== 'owner' && currentRole !== 'editor') return c.json({ error: "Unauthorized" }, 403)

        let targetUserId = email;
        const userCheck = await db.query.users.findFirst({
            where: eq(users.email, email)
        })
        if (userCheck) {
            targetUserId = userCheck.id;
        }

        const rawSpaceId = id.split(':')[1];

        await db.delete(spacePermissions)
            .where(and(
                eq(spacePermissions.userId, targetUserId),
                eq(spacePermissions.spaceId, rawSpaceId)
            ))

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Delete Permission] Error:", e)
        return c.json({ error: "Failed to remove permission" }, 500)
    }
})

spaces.get("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Fetch spaces where user is owner OR has explicit permission
        const userSpaces = await db.select()
            .from(dataSpaces)
            .leftJoin(spacePermissions, eq(dataSpaces.id, spacePermissions.spaceId))
            .where(or(
                eq(dataSpaces.userId, userId),
                eq(spacePermissions.userId, userId)
            ))
            .orderBy(sql`${dataSpaces.createdAt} DESC`)

        let results = userSpaces.map(row => ({
            ...row.data_space,
            permission_role: row.space_permission?.role || (row.data_space.userId === userId ? 'owner' : null)
        }))

        // Auto-provision personal space if empty
        if (results.length === 0) {
            console.log(`[Spaces] Provisioning default space for user ${userId}`);
            const [newSpace] = await db.insert(dataSpaces)
                .values({
                    userId,
                    name: 'Personal Space',
                    description: 'Your default workspace for data analysis.',
                    icon: 'box',
                    color: '#8B5CF6',
                    isDefault: true
                })
                .returning()

            results = [{ ...newSpace, permission_role: 'owner' }];

            // Migration: Link existing connections to this new space
            await db.update(connections)
                .set({ spaceId: newSpace.id })
                .where(and(
                    eq(connections.userId, userId),
                    or(sql`${connections.spaceId} IS NULL`)
                ))

            console.log(`[Spaces] Migrated existing connections for user ${userId} to new space ${newSpace.id}`);
        }

        return c.json({ spaces: results });
    } catch (e) {
        console.error("[Spaces] Fetch failed:", e);
        return c.json({ error: e.message }, 500);
    }
});

spaces.post("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const body = await c.req.json()
        const { name, description, icon, color } = body

        const [result] = await db.insert(dataSpaces)
            .values({
                userId,
                name,
                description,
                icon: icon || "database",
                color: color || "#8B5CF6",
                isDefault: false
            })
            .returning()

        return c.json(result);
    } catch (e) {
        console.error("[Spaces] Failed to create space:", e);
        return c.json({ error: e.message }, 500);
    }
});

spaces.put("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const body = await c.req.json()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const [result] = await db.update(dataSpaces)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(eq(dataSpaces.id, rawId))
            .returning()

        return c.json(result);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        await db.delete(dataSpaces).where(eq(dataSpaces.id, rawId))
        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.get("/:id/sources", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const results = await db.select()
            .from(spaceSources)
            .where(eq(spaceSources.spaceId, rawId))
            .orderBy(sql`${spaceSources.createdAt} DESC`)

        return c.json({ sources: results || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// SPACE FILES
spaces.get("/:id/files", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const results = await db.select({
            id: spaceFiles.id,
            filename: spaceFiles.filename,
            fileType: spaceFiles.fileType,
            storagePath: spaceFiles.storagePath,
            fileSizeBytes: spaceFiles.fileSizeBytes,
            createdAt: spaceFiles.createdAt
        })
            .from(spaceFiles)
            .where(eq(spaceFiles.spaceId, rawId))
            .orderBy(sql`${spaceFiles.createdAt} DESC`)

        return c.json({ files: results || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.post("/:id/files", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const body = await c.req.json()
        const { filename, file_type, storage_path, file_size_bytes, parsed_schema } = body

        const [result] = await db.insert(spaceFiles)
            .values({
                spaceId: rawId,
                filename,
                fileType: file_type,
                storagePath: storage_path,
                fileSizeBytes: file_size_bytes || 0,
                parsedSchema: parsed_schema || {}
            })
            .returning()

        return c.json(result);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// SPACE NOTES
spaces.get("/:id/notes", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        const results = await db.select()
            .from(spaceNotes)
            .where(eq(spaceNotes.spaceId, rawId))
            .orderBy(sql`${spaceNotes.createdAt} DESC`)

        return c.json({ notes: results || [] });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.post("/:id/notes", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const rawId = id.includes(':') ? id.split(':')[1] : id
        const body = await c.req.json()
        const { title, content, note_type } = body

        const [result] = await db.insert(spaceNotes)
            .values({
                spaceId: rawId,
                title: title || "Untitled Note",
                content: content || "",
                noteType: note_type || "general"
            })
            .returning()

        return c.json(result);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.put("/notes/:noteId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { noteId } = c.req.param()
        const body = await c.req.json()
        const rawId = noteId.includes(':') ? noteId.split(':')[1] : noteId

        const [result] = await db.update(spaceNotes)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(eq(spaceNotes.id, rawId))
            .returning()

        return c.json(result);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.delete("/notes/:noteId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { noteId } = c.req.param()
        const rawId = noteId.includes(':') ? noteId.split(':')[1] : noteId

        await db.delete(spaceNotes).where(eq(spaceNotes.id, rawId))
        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export const spaceRoutes = spaces
