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

        // Cookie configuration for mobile compatibility
        // Using 'Lax' instead of 'None' because:
        // 1. Frontend and backend are on different Vercel domains
        // 2. Mobile browsers (especially Safari) block 'None' cookies in cross-site contexts
        // 3. 'Lax' allows cookies on top-level navigations (OAuth redirects) while preventing CSRF
        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: "Lax", // Changed from 'None' to 'Lax' for mobile compatibility
            path: "/",
            maxAge: 60 * 60 * 24, // 24 hours
        }

        console.log('[Auth /callback] Setting session cookie with options:', {
            secure: cookieOptions.secure,
            sameSite: cookieOptions.sameSite,
            isProduction
        })

        setCookie(c, "session", token, cookieOptions)

        // improved redirect logic
        const returnTo = getCookie(c, "auth_return_to");
        if (returnTo) {
            deleteCookie(c, "auth_return_to");
            // Include token in URL for mobile/cross-domain compatibility
            const redirectUrl = new URL(returnTo)
            redirectUrl.searchParams.set('token', token)
            console.log('[Auth /callback] Redirecting to returnTo with token')
            return c.redirect(redirectUrl.toString());
        }

        const frontendUrl = allowedOrigins[0] || "http://localhost:5173"
        // Include token in URL for mobile/cross-domain compatibility
        const redirectUrl = new URL(frontendUrl)
        redirectUrl.searchParams.set('token', token)
        console.log('[Auth /callback] Redirecting to:', redirectUrl.toString())
        return c.redirect(redirectUrl.toString())
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
    // Try cookie first (desktop/same-domain)
    let token = getCookie(c, "session")

    // Fallback to Authorization header (mobile/cross-domain)
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }

    console.log('[Auth /me] Request received, token present:', !!token, 'source:', token ? (getCookie(c, "session") ? 'cookie' : 'header') : 'none')

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
            },
            token // Include token so frontend can store it in localStorage
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

// ============================================
// DEVICE AUTHORIZATION FLOW (for Desktop Apps)
// ============================================

// In-memory store for pending device authorizations (use Redis in production)
const deviceCodes = new Map()

// Step 1: Desktop app requests a device code
auth.post('/device/code', async (c) => {
    const code = crypto.randomUUID().slice(0, 8).toUpperCase() // Short readable code
    const deviceCode = crypto.randomUUID() // Internal device code for polling

    deviceCodes.set(deviceCode, {
        userCode: code,
        status: 'pending', // pending | authorized | expired
        token: null,
        user: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    })

    console.log('[Auth Device] Code generated:', code, 'deviceCode:', deviceCode)

    return c.json({
        device_code: deviceCode,
        user_code: code,
        verification_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/device`,
        expires_in: 600 // 10 minutes
    })
})

// Step 2: Desktop app polls for authorization status
auth.get('/device/token', async (c) => {
    const deviceCode = c.req.query('device_code')

    if (!deviceCode) {
        return c.json({ error: 'device_code required' }, 400)
    }

    const session = deviceCodes.get(deviceCode)

    if (!session) {
        return c.json({ error: 'expired_token', error_description: 'Device code not found or expired' }, 400)
    }

    // Check expiry
    if (Date.now() > session.expiresAt) {
        deviceCodes.delete(deviceCode)
        return c.json({ error: 'expired_token', error_description: 'Device code expired' }, 400)
    }

    if (session.status === 'pending') {
        return c.json({ error: 'authorization_pending' }, 400)
    }

    if (session.status === 'authorized' && session.token) {
        // Success! Clean up and return token
        deviceCodes.delete(deviceCode)
        console.log('[Auth Device] Token issued for user:', session.user?.email)
        return c.json({
            access_token: session.token,
            token_type: 'Bearer',
            user: session.user
        })
    }

    return c.json({ error: 'authorization_pending' }, 400)
})

// Step 3: Browser submits user code after OAuth
auth.post('/device/authorize', async (c) => {
    const { user_code, token, user } = await c.req.json()

    if (!user_code || !token) {
        return c.json({ error: 'user_code and token required' }, 400)
    }

    // Find the device session by user code
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

    // Authorize the device
    const session = deviceCodes.get(foundDeviceCode)
    session.status = 'authorized'
    session.token = token
    session.user = user
    deviceCodes.set(foundDeviceCode, session)

    console.log('[Auth Device] Code authorized:', user_code, 'for user:', user?.email)

    return c.json({ success: true, message: 'Device authorized! You can close this window.' })
})

// Step 4: Browser page to enter code (or auto-fill from URL)
auth.get('/device/verify', async (c) => {
    const code = c.req.query('code')

    if (code) {
        // Validate code exists
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

