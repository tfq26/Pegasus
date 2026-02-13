
import { verify } from "hono/jwt"
import { ConfigService } from "../services/ConfigService.js"
import { getAuthToken } from "../../lib/auth.js"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { eq } from "drizzle-orm"

const jwtSecret = ConfigService.getJwtSecret()

/**
 * Middleware to authenticate requests and upsert users.
 * Attaches userId and user object to c.set('userId', ...) and c.set('user', ...)
 */
export const authMiddleware = async (c, next) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub || payload.id

        // Cache user in context to avoid multiple DB lookups in the same request
        c.set('userId', userId)
        c.set('userPayload', payload)

        // Proactive background upsert (don't block the request if not critical)
        // We'll do a quick check/upsert only if needed or just trust the JWT for non-critical paths
        // For now, let's keep it simple and attach it.

        await next()
    } catch (e) {
        console.error("[AuthMiddleware] Token verification failed:", e.message)
        return c.json({ error: "Invalid session" }, 401)
    }
}

/**
 * Optional: Ensure user exists in DB and fetch full record
 */
export const requireUser = async (c, next) => {
    const userId = c.get('userId')
    if (!userId) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = c.get('userPayload')
        const firstName = payload.firstName || payload.first_name || ""
        const lastName = payload.lastName || payload.last_name || ""
        const pic = (payload.profilePictureUrl || payload.profile_picture_url) ?? null

        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName,
                lastName,
                profilePictureUrl: pic,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName,
                    lastName,
                    profilePictureUrl: pic,
                    updatedAt: new Date()
                }
            })
            .returning();

        c.set('user', user)
        await next()
    } catch (e) {
        console.error("[AuthMiddleware] requireUser failed:", e)
        return c.json({ error: "User session error" }, 500)
    }
}
