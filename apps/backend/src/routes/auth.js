import { Hono } from "hono"
import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { getUserFeatureFlags, getExperimentalStatus } from "../../experimental-features.js"

const auth = new Hono()

// Configuration
const workos = new WorkOS(process.env.WORKOS_API_KEY || "sk_test_placeholder")
const clientId = process.env.WORKOS_CLIENT_ID
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const redirectUri = process.env.WORKOS_REDIRECT_URI || "http://localhost:5173/auth/callback"

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ["http://localhost:5173", "http://127.0.0.1:5173"]

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        console.log(`[Auth] Upserting user: ${userRecordId}`)

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
                firstName: payload.firstName,
                lastName: payload.lastName,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
            console.log(`[Auth] User updated: ${payload.email}`)
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
                firstName: payload.firstName,
                lastName: payload.lastName,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });
            console.log(`[Auth] User created: ${payload.email}`)
        }

    } catch (e) {
        console.error("[Auth] Failed to upsert user:", e)
        throw e
    }
}

// Routes
auth.get("/login", (c) => {
    const returnTo = c.req.query("return_to");
    if (returnTo) {
        setCookie(c, "auth_return_to", returnTo, {
            httpOnly: true,
            path: '/',
            maxAge: 300, // 5 min
            sameSite: 'Lax'
        });
    }

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        clientId,
        redirectUri,
    })

    return c.redirect(authorizationUrl)
})

auth.get("/callback", async (c) => {
    const code = c.req.query("code")

    if (!code) {
        return c.json({ error: "No code provided" }, 400)
    }

    try {
        console.log("Auth Debug Info:")
        console.log("- Redirect URI:", redirectUri)
        console.log("- Client ID:", clientId)

        const { user } = await workos.userManagement.authenticateWithCode({
            code,
            clientId,
            redirectUri,
        })

        console.log("WorkOS User Object:", user.email)

        // Check for email collision (different ID)
        const existingUserRs = await db.query("SELECT id FROM user WHERE email = $email AND id != $userId", {
            email: user.email,
            userId: `user:${user.id}`
        });

        if (existingUserRs[0] && existingUserRs[0].length > 0) {
            const existingId = existingUserRs[0][0].id;
            console.log(`[Auth] Email ${user.email} exists with different ID (${existingId}). Cleaning up old user...`)
            await db.query(`DELETE ${existingId}`);
        }

        await upsertUser(user);

        const payload = {
            sub: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null,
            organizationName: user.organizationName || user.organization?.name || null,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
        }

        const token = await sign(payload, jwtSecret)
        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

        setCookie(c, "session", token, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "None" : "Lax",
            path: "/",
            maxAge: 60 * 60 * 24,
        })

        // improved redirect logic
        const returnTo = getCookie(c, "auth_return_to");
        if (returnTo) {
            deleteCookie(c, "auth_return_to");
            return c.redirect(returnTo);
        }

        const frontendUrl = allowedOrigins[0] || "http://localhost:5173"
        return c.redirect(frontendUrl)
    } catch (error) {
        console.error("Auth error:", error)
        return c.json({ error: error.message }, 500)
    }
})

auth.get("/logout", (c) => {
    deleteCookie(c, "session")
    return c.json({ success: true })
})

auth.get("/me", async (c) => {
    const token = getCookie(c, "session")

    console.log('[Auth /me] Request received, token present:', !!token)

    if (!token) {
        console.log('[Auth /me] No session token, returning null user')
        return c.json({ user: null })
    }

    try {
        const payload = await verify(token, jwtSecret)
        console.log('[Auth /me] Token verified, user:', payload.email)

        // Get user's feature flags
        const featureFlags = await getUserFeatureFlags(db, payload.sub)

        const response = {
            user: {
                ...payload,
                featureFlags
            }
        }

        console.log('[Auth /me] Returning user data:', {
            email: payload.email,
            sub: payload.sub,
            hasFeatureFlags: featureFlags.length > 0
        })

        return c.json(response)
    } catch (error) {
        console.error('[Auth /me] Token verification failed:', error.message)
        return c.json({ error: "Invalid token" }, 401)
    }
})

export { auth as authRoutes }
