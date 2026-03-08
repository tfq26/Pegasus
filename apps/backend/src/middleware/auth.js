
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
import { activityService } from "../services/ActivityService.js"

export const authMiddleware = async (c, next) => {
    activityService.recordActivity();
    const token = getAuthToken(c)
    const isDevMode = process.env.PEGASUS_DEV_MODE === 'true' || process.env.PEGASUS_DEV_MODE === true;

    // DEV MODE BYPASS
    if (isDevMode && (!token || token === 'dev_token' || token === 'dev_token_pegasus')) {
        const payload = {
            sub: 'dev_user',
            email: 'dev@pegasus.ai',
            firstName: 'Developer',
            lastName: 'User'
        };
        c.set('userId', 'dev_user');
        c.set('userPayload', payload);
        return await next();
    }

    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub || payload.id

        // Cache user in context
        c.set('userId', userId)
        c.set('userPayload', payload)

        await next()
    } catch (e) {
        if (isDevMode) {
            console.error(`[Auth] Dev Mode - Token verification failed but allowing: ${e.message}`);
            const payload = { sub: 'dev_user', email: 'dev@pegasus.ai' };
            c.set('userId', 'dev_user');
            c.set('userPayload', payload);
            return await next();
        }
        console.error("[AuthMiddleware] Token verification failed:", e.message)
        return c.json({ error: "Invalid session" }, 401)
    }
}

const userCache = new Map();
const CACHE_TTL = 300000; // 5 minute cache

/**
 * Optional: Ensure user exists in DB and fetch full record
 */
export const requireUser = async (c, next) => {
    const userId = c.get('userId')
    if (!userId) return c.json({ error: "Unauthorized" }, 401)

    // Check Cache
    const cached = userCache.get(userId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        c.set('user', cached.user);
        return await next();
    }

    try {
        const payload = c.get('userPayload')
        const firstName = payload.firstName || payload.first_name || ""
        const lastName = payload.lastName || payload.last_name || ""
        const pic = (payload.profilePictureUrl || payload.profile_picture_url) ?? null

        const isDevMode = process.env.PEGASUS_DEV_MODE === 'true' || process.env.PEGASUS_DEV_MODE === true;
        const tier = (isDevMode && userId === 'dev_user') ? 'enterprise' : 'free';

        const [user] = await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName,
                lastName,
                profilePictureUrl: pic,
                subscriptionTier: tier,
                updatedAt: new Date()
            })
            .onConflictDoUpdate({
                target: users.id,
                set: {
                    email: payload.email,
                    firstName,
                    lastName,
                    profilePictureUrl: pic,
                    subscriptionTier: tier,
                    updatedAt: new Date()
                }
            })
            .returning();

        // Update Cache
        userCache.set(userId, { user, timestamp: Date.now() });

        c.set('user', user)
        await next()
    } catch (e) {
        console.error("[AuthMiddleware] requireUser failed:", e)
        return c.json({ error: "User session error" }, 500)
    }
}

/**
 * Clear user cache for a specific user ID
 */
export const clearUserCache = (userId) => {
    userCache.delete(userId);
}
