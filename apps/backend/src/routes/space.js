import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../db/index.js"
import { dataSpaces, spacePermissions, users, connections, spaceSources, spaceFiles, spaceNotes, chats, queryHistory, dashboards, dashboardElements, dashboardPermissions, notifications } from "../db/schema.js"
import { eq, and, or, sql } from "drizzle-orm"
import { ConfigService } from "../services/ConfigService.js"
import { StorageManager } from "../services/storage/StorageManager.js"
import { SnapshotService } from "../services/SnapshotService.js"

import { RAGService } from "../services/ragService.js"
import { canUploadFile } from "../../lib/tierLimits.js"

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

// --- ROUTES ---

spaces.delete("/files/:fileId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const fileId = c.req.param("fileId")
        // Safer ID parsing: only split if it starts with 'file:'
        const rawId = fileId.startsWith('file:') ? fileId.split(':')[1] : fileId

        // 1. Fetch File
        const rows = await db.select().from(spaceFiles)
            .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
            .where(eq(spaceFiles.id, rawId));

        const file = rows[0];

        if (!file) {
            return c.json({ error: "File not found" }, 404);
        }

        // 2. Permission Check
        const spaceId = file.space_file.spaceId;
        const role = await getSpaceRole(userId, spaceId);

        if (role !== 'owner' && role !== 'editor') {
            return c.json({ error: "Unauthorized" }, 403);
        }

        // 3. Delete from Storage
        if (file.space_file.storagePath) {
            try {
                // Get provider for the space owner
                const ownerId = file.data_space.userId;
                const provider = await StorageManager.getProvider(ownerId);
                await provider.delete(file.space_file.storagePath);

                // Update quota
                await db.execute(sql`UPDATE pegasus_user SET storage_used = GREATEST(0, storage_used - ${file.space_file.fileSizeBytes}) WHERE id = ${ownerId}`);

            } catch (err) {
                console.warn("Failed to delete file from storage:", err);
            }
        }

        // 4. Delete from DB
        await db.delete(spaceFiles).where(eq(spaceFiles.id, rawId));

        return c.json({ success: true });
    } catch (e) {
        console.error("Delete file failed:", e);
        return c.json({ error: e.message }, 500);
    }
});

spaces.get("/:id/permissions", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        if (!id.includes(':')) id = `data_space:${id}`
        const rawSpaceId = id.split(':')[1]

        const role = await getSpaceRole(userId, id);
        if (!role) return c.json({ error: "Unauthorized" }, 403)

        const currentPerms = await db.select({
            access_level: spacePermissions.role,
            alias: spacePermissions.alias,
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

spaces.put("/:id/permissions/:email", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        let id = c.req.param("id")
        const email = decodeURIComponent(c.req.param("email"))
        if (!id.includes(':')) id = `data_space:${id}`

        const body = await c.req.json()
        const { role, alias } = body

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

        // Construct update object dynamically
        const updates = {};
        if (role) updates.role = role;
        if (alias !== undefined) updates.alias = alias;
        updates.updatedAt = new Date(); // If we had updatedAt on permissions, but we don't. Drizzle ignores extras usually.

        await db.update(spacePermissions)
            .set(updates)
            .where(and(
                eq(spacePermissions.userId, targetUserId),
                eq(spacePermissions.spaceId, rawSpaceId)
            ))

        return c.json({ ok: true })
    } catch (e) {
        console.error("[Update Permission] Error:", e)
        return c.json({ error: "Failed to update permission" }, 500)
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
                    isDefault: true,
                    isPersonal: true
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
        const { name, description, icon, color, tags } = body

        const [result] = await db.insert(dataSpaces)
            .values({
                userId,
                name,
                description,
                icon: icon || "database",
                color: color || "#8B5CF6",
                tags: tags || [],
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
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { id } = c.req.param()
        const body = await c.req.json()
        const rawId = id.includes(':') ? id.split(':')[1] : id

        // 1. Check Permissions (Existing logic was missing this!)
        // Implicitly checks if user owns the space via userId matching or if we trust the update
        // Since we are changing 'default', we must ensure the user owns this space or is at least an editor? 
        // Typically 'default' is a personal preference, but here spaces are shared. 
        // 'isDefault' on the space object implies it's the default for the OWNER or arguably the space itself is 'default'?
        // Schema: isDefault is on dataSpaces table. This means it's a global property of the space.
        // If 'Personal Space' is default, it's default for everyone? No, `dataSpaces` has `userId`.
        // So `isDefault` is likely "Is this the default space for the USER who owns it?".

        // If updating isDefault to true, unset others for this user
        if (body.isDefault === true) {
            await db.update(dataSpaces)
                .set({ isDefault: false })
                .where(eq(dataSpaces.userId, userId))
        }

        const [result] = await db.update(dataSpaces)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(and(eq(dataSpaces.id, rawId), eq(dataSpaces.userId, userId))) // Ensure user owns it
            .returning()

        if (!result) {
            return c.json({ error: "Space not found or unauthorized" }, 404);
        }

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
        const { filename, file_type, storage_path, file_size_bytes, parsed_schema, content_buffer_base64 } = body

        // 1. Get User ID
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // 2. Determine File ID (New or Update)
        // Check if file with same name exists in space?
        const [existing] = await db.select().from(spaceFiles)
            .where(and(eq(spaceFiles.spaceId, rawId), eq(spaceFiles.filename, filename))) // Simple check
            .limit(1);

        let fileId = existing ? existing.id : crypto.randomUUID();
        let result;

        if (existing) {
            // UPDATE VERSION
            if (content_buffer_base64) {
                const buffer = Buffer.from(content_buffer_base64, 'base64');
                const uploadRes = await SnapshotService.uploadFileVersion(existing.id, userId, buffer, file_type, filename);

                // Re-index RAG?
                try {
                    await RAGService.indexFileFromStorage(uploadRes.key, filename, userId);
                } catch (idxErr) {
                    console.warn("RAG Indexing failed triggered from upload:", idxErr);
                }

                // Update DB record with new result is handled inside uploadFileVersion but we need to return something
                // We should just return the updated file record
                [result] = await db.select().from(spaceFiles).where(eq(spaceFiles.id, existing.id));
            } else {
                // Metadata update only?
                // For now, assume upload always has content.
                result = existing;
            }
        } else {
            // NEW FILE
            // Upload to S3 first
            let key = storage_path; // If provided by frontend direct upload?

            // If frontend sends content, we upload.
            if (content_buffer_base64) {
                const buffer = Buffer.from(content_buffer_base64, 'base64');
                const fileBytes = buffer.length;

                // QUOTA CHECK
                const quotaCheck = await canUploadFile(db, userId, fileBytes);
                if (!quotaCheck.allowed) {
                    return c.json({ error: quotaCheck.message }, 403);
                }

                const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                key = `files/${userId}/${fileId}_v1_${safeFilename}`;

                const provider = await StorageManager.getProvider(userId);
                await provider.upload(key, buffer, file_type);

                // Update Storage Usage
                await db.execute(sql`UPDATE pegasus_user SET storage_used = storage_used + ${fileBytes} WHERE id = ${userId}`);

                // RAG Index
                try {
                    await RAGService.indexFileFromStorage(key, filename, userId);
                } catch (idxErr) {
                    console.warn("RAG Indexing failed triggered from upload:", idxErr);
                }
            }

            [result] = await db.insert(spaceFiles)
                .values({
                    id: fileId,
                    spaceId: rawId,
                    filename,
                    fileType: file_type,
                    storagePath: key,
                    fileSizeBytes: file_size_bytes || 0,
                    parsedSchema: parsed_schema || {},
                    storageId: key, // Hybrid Storage ID
                    version: 1,
                    isRagIndexed: true // Optimistically true if we ran indexFileFromStorage
                })
                .returning()
        }

        return c.json(result);
    } catch (e) {
        console.error("File upload failed:", e);
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

        // For list view, we prefer the 'preview' or truncated content.
        // We DO NOT hydrate from S3 here to keep it fast.
        const mapped = results.map(n => ({
            ...n,
            content: n.preview || n.content // fallback if old note
        }));

        return c.json({ notes: mapped });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.get("/notes/:noteId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const { noteId } = c.req.param()
        const rawId = noteId.includes(':') ? noteId.split(':')[1] : noteId

        // 1. Fetch DB Record
        const [note] = await db.select().from(spaceNotes).where(eq(spaceNotes.id, rawId)).limit(1);

        if (!note) return c.json({ error: "Note not found" }, 404);

        // 2. Hydrate content if in storage
        if (note.storageId) {
            try {
                const remote = await StorageManager.getProvider(note.spaceId); // Using space owner? No, stick to current logic.
                // Actually StorageManager.getProvider takes userId. We need the space owner userId.
                // For now, let's assume the current user has access to read the S3 object if they have access to the note.
                // However, the BUCKET is configured per user. So we need the space owner's ID.

                // Let's resolve Space Owner
                const [space] = await db.select().from(dataSpaces).where(eq(dataSpaces.id, note.spaceId));
                const provider = await StorageManager.getProvider(space.userId);

                // Get Presigned URL and fetch? Or fetch server-side?
                // Server-side fetch simplifies CORS/Auth for now.
                const url = await provider.getPresignedUrl(note.storageId);
                const response = await fetch(url);
                const json = await response.json();
                note.content = json.content;
            } catch (err) {
                console.error("Failed to hydrate note:", err);
                note.content = "Error loading content.";
            }
        }

        return c.json(note);
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
        const { title, content, note_type } = body
        const contentStr = content || "";

        let storageId = null;
        let finalContent = contentStr;
        let preview = contentStr.substring(0, 200);

        // Check for Offload
        if (contentStr.length > 2000) {
            // Get User ID for storage path
            const [space] = await db.select().from(dataSpaces).where(eq(dataSpaces.id, rawId));
            const ownerId = space.userId;

            const contentBytes = Buffer.byteLength(contentStr, 'utf8');

            // Quota Check
            const quotaCheck = await canUploadFile(db, ownerId, contentBytes);
            if (!quotaCheck.allowed) return c.json({ error: quotaCheck.message }, 403);

            const noteUuid = crypto.randomUUID();
            const key = `notes/${ownerId}/${noteUuid}.json`;
            const provider = await StorageManager.getProvider(ownerId);

            await provider.upload(key, JSON.stringify({ content: contentStr }), "application/json");

            // Update Usage
            await db.execute(sql`UPDATE pegasus_user SET storage_used = storage_used + ${contentBytes} WHERE id = ${ownerId}`);

            storageId = key;
            finalContent = null; // Clear from DB
        }

        const [result] = await db.insert(spaceNotes)
            .values({
                spaceId: rawId,
                title: title || "Untitled Note",
                content: finalContent,
                preview,
                storageId,
                noteType: note_type || "general"
            })
            .returning()

        return c.json(result);
    } catch (e) {
        console.error("Note creation failed", e);
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

        // Handle Content Update
        if (body.content !== undefined) {
            const contentStr = body.content || "";
            body.preview = contentStr.substring(0, 200);

            // Check Offload Logic
            // Check Offload Logic
            if (contentStr.length > 2000) {
                // Fetch existing note to get space/owner
                const [existing] = await db.select().from(spaceNotes)
                    .innerJoin(dataSpaces, eq(spaceNotes.spaceId, dataSpaces.id))
                    .where(eq(spaceNotes.id, rawId));

                const ownerId = existing ? existing.data_space.userId : userId; // Fallback

                const contentBytes = Buffer.byteLength(contentStr, 'utf8');
                // Quota Check
                const quotaCheck = await canUploadFile(db, ownerId, contentBytes);
                if (!quotaCheck.allowed) return c.json({ error: quotaCheck.message }, 403);

                const key = `notes/${ownerId}/${rawId}.json`;
                const provider = await StorageManager.getProvider(ownerId);

                await provider.upload(key, JSON.stringify({ content: contentStr }), "application/json");

                // Update Usage
                await db.execute(sql`UPDATE pegasus_user SET storage_used = storage_used + ${contentBytes} WHERE id = ${ownerId}`);

                body.storageId = key;
                body.content = null;
            } else {
                // If it shrunk, clear storageId? 
                // Optionally clear old file, but for now just update DB.
                body.storageId = null;
            }
        }

        const [result] = await db.update(spaceNotes)
            .set({
                ...body,
                updatedAt: new Date()
            })
            .where(eq(spaceNotes.id, rawId))
            .returning()

        return c.json(result);
    } catch (e) {
        console.error("Note update failed", e);
        return c.json({ error: e.message }, 500);
    }
});

spaces.delete("/notes/:noteId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { noteId } = c.req.param()
        const rawId = noteId.includes(':') ? noteId.split(':')[1] : noteId

        // Cleanup storage if offloaded
        const note = await db.query.spaceNotes.findFirst({ where: eq(spaceNotes.id, rawId) });
        if (note && note.storageId) {
            try {
                const [space] = await db.select().from(dataSpaces).where(eq(dataSpaces.id, note.spaceId));
                const provider = await StorageManager.getProvider(space.userId);
                await provider.delete(note.storageId);
            } catch (err) {
                console.warn("Failed to delete note content from storage:", err);
            }
        }

        await db.delete(spaceNotes).where(eq(spaceNotes.id, rawId))
        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

// Bulk Delete Endpoint
spaces.post("/bulk-delete", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const { items } = await c.req.json() // [{ type, id }]

        if (!items || !Array.isArray(items)) {
            return c.json({ error: "Invalid items array" }, 400);
        }

        const results = {
            success: [],
            failed: []
        };

        for (const item of items) {
            const { type, id } = item;
            const rawId = id.includes(':') ? id.split(':')[1] : id;

            try {
                if (type === 'file') {
                    // 1. Fetch File and Join Space
                    const [fileRow] = await db.select().from(spaceFiles)
                        .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
                        .where(eq(spaceFiles.id, rawId));

                    if (fileRow) {
                        // 2. Storage Cleanup
                        if (fileRow.space_file.storagePath) {
                            try {
                                const provider = await StorageManager.getProvider(fileRow.data_space.userId || userId);
                                await provider.delete(fileRow.space_file.storagePath);
                                // Update Quota
                                await db.execute(sql`UPDATE pegasus_user SET storage_used = GREATEST(0, storage_used - ${fileRow.space_file.fileSizeBytes}) WHERE id = ${fileRow.data_space.userId}`);
                            } catch (e) { console.warn("Storage deletion failed:", e) }
                        }
                        // 3. Deletion from DB
                        await db.delete(spaceFiles).where(eq(spaceFiles.id, rawId));
                    }
                } else if (type === 'note') {
                    const note = await db.query.spaceNotes.findFirst({ where: eq(spaceNotes.id, rawId) });
                    if (note) {
                        if (note.storageId) {
                            try {
                                const [space] = await db.select().from(dataSpaces).where(eq(dataSpaces.id, note.spaceId));
                                const provider = await StorageManager.getProvider(space.userId);
                                await provider.delete(note.storageId);
                            } catch (e) { console.warn("Note storage deletion failed:", e) }
                        }
                        await db.delete(spaceNotes).where(eq(spaceNotes.id, rawId));
                    }
                } else if (type === 'connection') {
                    await db.delete(connections).where(and(eq(connections.id, rawId), eq(connections.userId, userId)));
                } else if (type === 'chat') {
                    // Chat Deletion (handles storage cleanup if needed?)
                    // For now basic DB delete, logic mirror chat.delete endpoint
                    // Ideally we should reuse chat deletion service logic but for now raw delete + userId check is safe
                    await db.delete(chats).where(and(eq(chats.id, rawId), eq(chats.userId, userId)));
                } else if (type === 'query') {
                    // Query History Deletion
                    await db.delete(queryHistory).where(and(eq(queryHistory.id, rawId), eq(queryHistory.userId, userId)));
                } else if (type === 'dashboard') {
                    // Dashboard Deletion (mirroring dashboard.js logic)
                    const dash = await db.query.dashboards.findFirst({
                        where: and(eq(dashboards.id, rawId), eq(dashboards.ownerId, userId))
                    });

                    if (dash) {
                        await db.delete(dashboards).where(eq(dashboards.id, rawId));

                        // Cleanup related records
                        await db.delete(dashboardElements).where(eq(dashboardElements.dashboardId, rawId));
                        await db.delete(dashboardPermissions).where(eq(dashboardPermissions.dashboardId, rawId));
                        await db.delete(notifications).where(eq(notifications.dashboardId, rawId));

                        // Notify via socket if available
                        try {
                            const { getIO, getRoom } = await import("../socket.js");
                            const io = getIO();
                            if (io) {
                                const room = getRoom(rawId);
                                io.to(room).emit('dashboard_deleted', { dashboardId: rawId });
                                io.in(room).socketsLeave(room);
                            }
                        } catch (e) {
                            console.warn("Socket notification failed for bulk dashboard delete:", e);
                        }
                    }
                }

                results.success.push(id);
            } catch (err) {
                console.error(`Failed to delete ${type} ${id}:`, err);
                results.failed.push({ id, error: err.message });
            }
        }

        return c.json(results);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});



export const spaceRoutes = spaces
