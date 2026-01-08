import { Hono } from "hono"
import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { getAuthToken } from "../../lib/auth.js"
import { getUserFeatureFlags, getExperimentalStatus } from "../../experimental-features.js"

const auth = new Hono()

// Configuration
const workos = new WorkOS(process.env.WORKOS_API_KEY || "sk_test_placeholder")
const clientId = process.env.WORKOS_CLIENT_ID
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const redirectUri = process.env.WORKOS_REDIRECT_URI ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/auth/callback` : "http://localhost:3000/auth/callback")

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "https://pegasus-ui-chi.vercel.app"
    ]

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`



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
                    subscription_tier = subscription_tier OR 'free',
                    purchased_tokens = type::number(purchased_tokens OR 0),
                    purchased_storage = type::number(purchased_storage OR 0),
                    stripe_customer_id = type::string(stripe_customer_id OR ""),
                    updated_at = time::now();
            `, {
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });

        } else {
            // User doesn't exist, create
            await db.query(`
                CREATE ${userRecordId} CONTENT {
                    email: $email,
                    first_name: $firstName,
                    last_name: $lastName,
                    profile_picture_url: $pic,
                    subscription_tier: 'free',
                    purchased_tokens: 0,
                    purchased_storage: 0,
                    stripe_customer_id: "",
                    created_at: time::now(),
                    updated_at: time::now()
                };
            `, {
                email: payload.email,
                firstName: payload.firstName,
                lastName: payload.lastName,
                pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
            });

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

        // Cookie configuration for mobile compatibility
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: "Lax",
            path: "/",
            maxAge: 60 * 60 * 24, // 24 hours
        }

        setCookie(c, "session", token, cookieOptions)

        const returnTo = getCookie(c, "auth_return_to");
        if (returnTo) {
            deleteCookie(c, "auth_return_to");
            console.log(`[Auth] Redirecting to return_to: ${returnTo}`);
            const redirectUrl = new URL(returnTo)
            redirectUrl.searchParams.set('token', token)
            return c.redirect(redirectUrl.toString());
        }

        // Fallback: Pick the best frontend URL from allowedOrigins
        const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
        let frontendUrl = allowedOrigins.find(o => o.includes('vercel.app')) || allowedOrigins[0];

        // If not in production, localhost is fine
        if (!isProd) {
            frontendUrl = allowedOrigins.find(o => o.includes('localhost')) || allowedOrigins[0];
        }

        console.log(`[Auth] No return_to found, falling back to: ${frontendUrl}`);
        const redirectUrl = new URL(frontendUrl)
        redirectUrl.searchParams.set('token', token)
        return c.redirect(redirectUrl.toString())
    } catch (error) {
        console.error("Auth error:", error)
        return c.json({ error: error.message }, 500)
    }
})

auth.get("/logout", (c) => {


    // Explicitly overwrite the cookie with past expiration
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

    // Use deleteCookie for maximum compatibility
    deleteCookie(c, "session", {
        path: "/",
        secure: isProduction,
        httpOnly: true,
        sameSite: "Lax",
    })

    // Also set it to empty with maxAge 0 as a fallback
    setCookie(c, "session", "", {
        path: "/",
        secure: isProduction,
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 0,
        expires: new Date(0)
    })



    // Support redirect-based logout for better browser cookie handling
    const redirectUrl = c.req.query("redirect")
    if (redirectUrl) {

        return c.redirect(redirectUrl)
    }

    return c.json({ success: true })
})

auth.get("/me", async (c) => {
    // Force no-cache logic for this sensitive endpoint
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    c.header('Pragma', 'no-cache')
    c.header('Expires', '0')

    const token = getAuthToken(c)

    if (!token) {
        return c.json({ user: null })
    }

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Fetch full user record for live stats (tier, tokens, etc)
        const [userData] = await db.query(`SELECT subscription_tier, purchased_tokens, purchased_storage FROM user:${userId}`);
        const userRecord = userData[0] || {};

        // Get user's feature flags
        const featureFlags = await getUserFeatureFlags(db, userId)

        const response = {
            user: {
                ...payload,
                ...userRecord,
                featureFlags
            },
            token
        }

        return c.json(response)
    } catch (error) {
        console.error('[Auth /me] Token verification failed:', error.message)
        return c.json({ error: "Invalid token" }, 401)
    }
})

// ============================================
// DEVICE AUTHORIZATION FLOW (for Desktop Apps)
// ============================================

const deviceCodes = new Map()

auth.post('/device/code', async (c) => {
    const code = crypto.randomUUID().slice(0, 8).toUpperCase()
    const deviceCode = crypto.randomUUID()

    deviceCodes.set(deviceCode, {
        userCode: code,
        status: 'pending',
        token: null,
        user: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000)
    })

    return c.json({
        device_code: deviceCode,
        user_code: code,
        verification_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/device`,
        expires_in: 600
    })
})

auth.get('/device/token', async (c) => {
    const deviceCode = c.req.query('device_code')

    if (!deviceCode) {
        return c.json({ error: 'device_code required' }, 400)
    }

    const session = deviceCodes.get(deviceCode)

    if (!session) {
        return c.json({ error: 'expired_token', error_description: 'Device code not found or expired' }, 400)
    }

    if (Date.now() > session.expiresAt) {
        deviceCodes.delete(deviceCode)
        return c.json({ error: 'expired_token', error_description: 'Device code expired' }, 400)
    }

    if (session.status === 'pending') {
        return c.json({ error: 'authorization_pending' }, 400)
    }

    if (session.status === 'authorized' && session.token) {
        deviceCodes.delete(deviceCode)
        return c.json({
            access_token: session.token,
            token_type: 'Bearer',
            user: session.user
        })
    }

    return c.json({ error: 'authorization_pending' }, 400)
})

auth.post('/device/authorize', async (c) => {
    const { user_code, token, user } = await c.req.json()

    if (!user_code || !token) {
        return c.json({ error: 'user_code and token required' }, 400)
    }

    let foundDeviceCode = null
    for (const [deviceCode, session] of deviceCodes.entries()) {
        if (session.userCode === user_code.toUpperCase() && session.status === 'pending') {
            foundDeviceCode = deviceCode
            break
        }
    }

    if (!foundDeviceCode) {
        return c.json({ error: 'Invalid or expired code' }, 400)
    }

    const session = deviceCodes.get(foundDeviceCode)
    session.status = 'authorized'
    session.token = token
    session.user = user
    deviceCodes.set(foundDeviceCode, session)

    return c.json({ success: true, message: 'Device authorized! You can close this window.' })
})

auth.get('/device/verify', async (c) => {
    const code = c.req.query('code')

    if (code) {
        let found = false
        for (const session of deviceCodes.values()) {
            if (session.userCode === code.toUpperCase() && session.status === 'pending') {
                found = true
                break
            }
        }

        return c.json({ valid: found, code: code.toUpperCase() })
    }

    return c.json({ valid: false })
})

export { auth as authRoutes }
