import { Hono } from "hono"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { ConfigService } from "../services/ConfigService.js"

const spaces = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

// Utility: Correct Role Determination
const getSpaceRole = async (userId, spaceId) => {
    const rawSpaceId = spaceId.includes(':') ? spaceId.split(':')[1] : spaceId;
    const rawUserId = userId.includes(':') ? userId.split(':')[1] : userId;
    const fullUserId = `user:${rawUserId}`;

    try {
        // 1. Check Ownership
        const [spaceResult] = await db.query(`
            SELECT user FROM type::thing('data_space', $spaceId);
        `, { spaceId: rawSpaceId });

        if (spaceResult && spaceResult.length > 0) {
            const owner = spaceResult[0].user;
            const ownerId = (owner && typeof owner === 'object') ? (owner.id || String(owner)) : String(owner);

            if (ownerId === fullUserId || ownerId === rawUserId || ownerId.endsWith(rawUserId)) {
                return 'owner';
            }
        }

        // 2. Check Permissions Table
        const [permCheck] = await db.query(`
            SELECT role FROM space_permission 
            WHERE space = type::thing('data_space', $spaceId) 
            AND user = type::thing('user', $userId) 
            LIMIT 1;
        `, { spaceId: rawSpaceId, userId: rawUserId });

        if (permCheck && permCheck.length > 0) {
            return permCheck[0].role;
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

        const rawSpaceId = id.split(':')[1];

        const [permissions] = await db.query(`
            SELECT 
                role as access_level,
                user as user_id,
                user.email as email,
                user.first_name as first_name,
                user.last_name as last_name,
                user.profile_picture_url as profile_picture_url,
                created_at 
            FROM space_permission 
            WHERE space = type::thing('data_space', $spaceId);
        `, { spaceId: rawSpaceId });

        const [ownerData] = await db.query(`
            SELECT 
                user as id,
                user.email as email,
                user.first_name as first_name,
                user.last_name as last_name,
                user.profile_picture_url as profile_picture_url
            FROM type::thing('data_space', $spaceId)
        `, { spaceId: rawSpaceId });

        return c.json({
            permissions: permissions || [],
            currentUserRole: role,
            owner: ownerData?.[0] || null
        })
    } catch (e) {
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

        const [targetUser] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });
        if (!targetUser || !targetUser.length) {
            return c.json({ error: "User not found. They must log in at least once." }, 404)
        }

        const rawTargetId = targetUser[0].id.toString().split(':')[1];
        const rawSpaceId = id.split(':')[1];

        await db.query(`
            INSERT INTO space_permission (user, space, role, created_at)
            VALUES (type::thing('user', $userId), type::thing('data_space', $spaceId), $role, time::now())
            ON DUPLICATE KEY UPDATE role = $role;
        `, { userId: rawTargetId, spaceId: rawSpaceId, role: role || 'read' });

        return c.json({ ok: true })
    } catch (e) {
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

        let rawTargetId = null;
        const [userCheck] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });
        if (userCheck && userCheck.length > 0) {
            rawTargetId = userCheck[0].id.toString().split(':')[1];
        } else {
            rawTargetId = email;
        }

        const rawSpaceId = id.split(':')[1];

        await db.query(`
            DELETE FROM space_permission 
            WHERE user = type::thing('user', $targetId) 
            AND space = type::thing('data_space', $spaceId);
        `, { targetId: rawTargetId, spaceId: rawSpaceId });

        return c.json({ ok: true })
    } catch (e) {
        return c.json({ error: "Failed to remove permission" }, 500)
    }
})

spaces.get("/", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const userRef = `user:${userId.split(':').pop()}`

        // Fetch spaces where user is owner OR has explicit permission
        let [results] = await db.query(`
            SELECT *, 
                (SELECT role FROM space_permission WHERE space = $parent.id AND user = type::thing('user', $userId))[0] as permission_role
            FROM data_space 
            WHERE user = type::thing('user', $userId) 
               OR (SELECT id FROM space_permission WHERE space = $parent.id AND user = type::thing('user', $userId))
            ORDER BY created_at DESC
        `, {
            userId: userId.split(':').pop()
        });

        // Auto-provision personal space if empty
        if (!results || results.length === 0) {
            console.log(`[Spaces] Provisioning default space for user ${userId}`);
            const [newSpaceResults] = await db.query(`
                CREATE data_space CONTENT {
                    user: type::thing('user', $userId),
                    name: 'Personal Space',
                    description: 'Your default workspace for data analysis.',
                    icon: 'box',
                    color: '#8B5CF6',
                    is_default: true,
                    created_at: time::now(),
                    updated_at: time::now()
                }
            `, { userId: userId.split(':').pop() });

            const newSpace = newSpaceResults[0];
            results = [newSpace];

            // Migration: Link existing connections to this new space
            if (newSpace) {
                await db.query(`
                    UPDATE connection SET space = $spaceId WHERE user = $user AND (space = NONE OR space = NULL)
                `, {
                    spaceId: newSpace.id,
                    user: userRef
                });
                console.log(`[Spaces] Migrated existing connections for user ${userId} to new space ${newSpace.id}`);
            }
        }

        return c.json({ spaces: results || [] });
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

        const [result] = await db.query(`
            CREATE data_space CONTENT {
                user: type::thing('user', $userId),
                name: $name,
                description: $description,
                icon: $icon,
                color: $color,
                is_default: false,
                created_at: time::now(),
                updated_at: time::now()
            }
        `, {
            userId: userId.split(':').pop(),
            name,
            description,
            icon: icon || "database",
            color: color || "#8B5CF6"
        });

        return c.json(result[0]);
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
        const spaceId = id.includes(':') ? id : `data_space:${id}`

        const [result] = await db.query(`
            UPDATE ${spaceId} MERGE $body
        `, { body: { ...body, updated_at: new Date() } });

        return c.json(result[0]);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.delete("/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { id } = c.req.param()
        const spaceId = id.includes(':') ? id : `data_space:${id}`

        await db.query(`DELETE ${spaceId}`);
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
        const spaceIdPart = id.includes(':') ? id.split(':').pop() : id

        const [results] = await db.query("SELECT * FROM space_source WHERE space = type::thing('data_space', $spaceId) ORDER BY created_at DESC", {
            spaceId: spaceIdPart
        });

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
        const spaceIdPart = id.includes(':') ? id.split(':').pop() : id

        const [results] = await db.query("SELECT id, filename, file_type, storage_path, file_size_bytes, created_at FROM space_file WHERE space = type::thing('data_space', $spaceId) ORDER BY created_at DESC", {
            spaceId: spaceIdPart
        });

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
        const spaceId = id.includes(':') ? id : `data_space:${id}`
        const body = await c.req.json()
        const { filename, file_type, storage_path, file_size_bytes, parsed_schema } = body

        const [result] = await db.query(`
            CREATE space_file CONTENT {
                space: type::thing('data_space', $spaceId),
                filename: $filename,
                file_type: $file_type,
                storage_path: $storage_path,
                file_size_bytes: $file_size_bytes,
                parsed_schema: $parsed_schema,
                created_at: time::now()
            }
        `, {
            spaceId: spaceId.split(':').pop(),
            filename,
            file_type,
            storage_path,
            file_size_bytes: file_size_bytes || 0,
            parsed_schema: parsed_schema || {}
        });

        return c.json(result[0]);
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
        const spaceIdPart = id.includes(':') ? id.split(':').pop() : id

        const [results] = await db.query("SELECT * FROM space_note WHERE space = type::thing('data_space', $spaceId) ORDER BY created_at DESC", {
            spaceId: spaceIdPart
        });

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
        const spaceId = id.includes(':') ? id : `data_space:${id}`
        const body = await c.req.json()
        const { title, content, note_type } = body

        const [result] = await db.query(`
            CREATE space_note CONTENT {
                space: type::thing('data_space', $spaceId),
                title: $title,
                content: $content,
                note_type: $note_type || 'general',
                created_at: time::now(),
                updated_at: time::now()
            }
        `, {
            spaceId: spaceId.split(':').pop(),
            title: title || "Untitled Note",
            content: content || "",
            note_type: note_type || "general"
        });

        return c.json(result[0]);
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
        const id = noteId.includes(':') ? noteId : `space_note:${noteId}`

        const [result] = await db.query(`
            UPDATE ${id} MERGE $body
        `, { body: { ...body, updated_at: new Date() } });

        return c.json(result[0]);
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

spaces.delete("/notes/:noteId", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { noteId } = c.req.param()
        const id = noteId.includes(':') ? noteId : `space_note:${noteId}`

        await db.query(`DELETE ${id}`);
        return c.json({ success: true });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export const spaceRoutes = spaces
