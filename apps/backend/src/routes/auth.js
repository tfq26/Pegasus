import { Hono } from "hono"
import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"
import { db } from "../../db/surreal.js"
import { getAuthToken } from "../../lib/auth.js"
import { getUserFeatureFlags } from "../../experimental-features.js"
import { ConfigService } from "../services/ConfigService.js"

const auth = new Hono()

// Configuration
const { apiKey, clientId, redirectUri } = ConfigService.getWorkOSConfig()
const workos = new WorkOS(apiKey)
const jwtSecret = ConfigService.getJwtSecret()

/**
 * [AUTH_TRACE] Helper to finalize login and redirect to frontend
 */
const finalizeLogin = async (c, { token, user, traceId, returnTo }) => {
    const isProduction = ConfigService.isProduction()
    const frontendUrl = ConfigService.getFrontendUrl()

    console.log(`[AUTH_TRACE] [${traceId}] Finalizing login for ${user.email}`)

    // 1. Set temporary session cookie for handshake/cross-domain compatibility
    setCookie(c, "session", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
    })

    // 2. Prepare the final redirect URL
    let targetUrl = returnTo || frontendUrl
    const finalRedirect = new URL(targetUrl, frontendUrl)

    // 3. Append token to URL so frontend identityService can capture and store it
    finalRedirect.searchParams.set('token', token)

    console.log(`[AUTH_TRACE] [${traceId}] Redirection sequence: ${finalRedirect.toString()}`)
    return c.redirect(finalRedirect.toString())
}

// Helper to ensure user exists in DB
const upsertUser = async (payload, traceId = 'system') => {
    try {
        const userId = payload.sub || payload.id
        const userRecordId = `user:${userId}`

        console.log(`[AUTH_TRACE] [${traceId}] Syncing user record: ${userRecordId}`)

        const firstName = payload.firstName || payload.first_name || ""
        const lastName = payload.lastName || payload.last_name || ""
        const pic = payload.profilePictureUrl || payload.profile_picture_url || null

        // Check if user exists
        const [existing] = await db.query(`SELECT id FROM ${userRecordId}`)

        if (existing && existing.length > 0) {
            await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    first_name = $firstName,
                    last_name = $lastName,
                    profile_picture_url = $pic,
                    updated_at = time::now();
            `, { email: payload.email, firstName, lastName, pic })
            console.log(`[AUTH_TRACE] [${traceId}] Record updated.`)
        } else {
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
            `, { email: payload.email, firstName, lastName, pic })
            console.log(`[AUTH_TRACE] [${traceId}] New record created.`)
        }
    } catch (e) {
        console.error(`[AUTH_TRACE] [${traceId}] Failed to upsert user:`, e.message)
        throw e
    }
}

// Routes
auth.get("/login", (c) => {
    const returnTo = c.req.query("return_to")
    const traceId = Math.random().toString(36).substring(7)
    const isProduction = ConfigService.isProduction()

    console.log(`[AUTH_TRACE] [${traceId}] Login initiated. return_to: ${returnTo || 'none'}`)

    if (returnTo) {
        setCookie(c, "auth_return_to", returnTo, {
            httpOnly: true,
            path: '/',
            maxAge: 300,
            sameSite: 'Lax',
            secure: isProduction
        })
    }

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        clientId,
        redirectUri,
    })

    console.log(`[AUTH_TRACE] [${traceId}] Redirecting to WorkOS...`)
    return c.redirect(authorizationUrl)
})

auth.get("/callback", async (c) => {
    const code = c.req.query("code")
    const traceId = Math.random().toString(36).substring(7)
    const isProduction = ConfigService.isProduction()

    console.log(`[AUTH_TRACE] [${traceId}] Callback received. Exchange start.`)

    if (!code) {
        console.error(`[AUTH_TRACE] [${traceId}] Error: No code in callback query params.`)
        return c.json({ error: "No code provided" }, 400)
    }

    try {
        const { user } = await workos.userManagement.authenticateWithCode({
            code,
            clientId,
            redirectUri,
        })

        console.log(`[AUTH_TRACE] [${traceId}] WorkOS auth success: ${user.email}`)

        // Cleanup duplicate records by email if they exist with different IDs
        const existingUserRs = await db.query("SELECT id FROM user WHERE email = $email AND id != $userId", {
            email: user.email,
            userId: `user:${user.id}`
        })

        if (existingUserRs[0] && existingUserRs[0].length > 0) {
            const existingId = existingUserRs[0][0].id
            console.log(`[AUTH_TRACE] [${traceId}] Conflict resolution: Removing stale record ${existingId}`)
            await db.query(`DELETE ${existingId}`)
        }

        await upsertUser(user, traceId)

        const payload = {
            sub: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null,
            organizationName: user.organizationName || user.organization?.name || null,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 Days
        }

        const token = await sign(payload, jwtSecret)

        const returnTo = getCookie(c, "auth_return_to")
        if (returnTo) {
            deleteCookie(c, "auth_return_to", { path: '/', secure: isProduction })
        }

        return finalizeLogin(c, { token, user, traceId, returnTo })

    } catch (error) {
        console.error(`[AUTH_TRACE] [${traceId}] Auth failure:`, error.message)

        // Check if this is a database token expiration error
        const isDatabaseError = error.message?.toLowerCase().includes('token has expired') ||
            error.message?.toLowerCase().includes('token expired');

        if (isDatabaseError) {
            console.log(`[AUTH_TRACE] [${traceId}] Database token expired, attempting recovery...`);
            try {
                // Import and use ensureConnection to re-authenticate
                const { ensureConnection } = await import('../../db/surreal.js');
                await ensureConnection();

                // Retry the user creation once after reconnection
                console.log(`[AUTH_TRACE] [${traceId}] Retrying after database reconnection...`);
                const { user } = await workos.userManagement.authenticateWithCode({
                    code,
                    clientId,
                    redirectUri,
                });

                // Process the user again
                const existingUserRs = await db.query("SELECT id FROM user WHERE email = $email AND id != $userId", {
                    email: user.email,
                    userId: `user:${user.id}`
                });

                if (existingUserRs[0] && existingUserRs[0].length > 0) {
                    const existingId = existingUserRs[0][0].id;
                    console.log(`[AUTH_TRACE] [${traceId}] Conflict resolution: Removing stale record ${existingId}`);
                    await db.query(`DELETE ${existingId}`);
                }

                await upsertUser(user, traceId);

                const payload = {
                    sub: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null,
                    organizationName: user.organizationName || user.organization?.name || null,
                    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 Days
                };

                const token = await sign(payload, jwtSecret);

                const returnTo = getCookie(c, "auth_return_to");
                if (returnTo) {
                    deleteCookie(c, "auth_return_to", { path: '/', secure: isProduction });
                }

                return finalizeLogin(c, { token, user, traceId, returnTo });
            } catch (retryError) {
                console.error(`[AUTH_TRACE] [${traceId}] Retry failed:`, retryError.message);
                const frontendUrl = ConfigService.getFrontendUrl();
                return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent('Authentication failed after database recovery. Please try again.')}`);
            }
        }

        // For non-database errors, redirect with the original error
        const frontendUrl = ConfigService.getFrontendUrl();
        return c.redirect(`${frontendUrl}/login?error=${encodeURIComponent(error.message)}`);
    }
})

auth.get("/logout", (c) => {
    const isProduction = ConfigService.isProduction()
    const traceId = Math.random().toString(36).substring(7)
    const frontendUrl = ConfigService.getFrontendUrl()

    console.log(`[AUTH_TRACE] [${traceId}] Logout requested. Purging server sessions.`)

    // Clear session cookies
    const cookieOptions = {
        path: "/",
        secure: isProduction,
        httpOnly: true,
        sameSite: "Lax",
    }

    deleteCookie(c, "session", cookieOptions)
    setCookie(c, "session", "", { ...cookieOptions, maxAge: 0, expires: new Date(0) })

    const redirectUrl = c.req.query("redirect") || frontendUrl
    console.log(`[AUTH_TRACE] [${traceId}] Logout complete. Redirecting to: ${redirectUrl}`)
    return c.redirect(redirectUrl)
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
        console.error(`[AUTH_TRACE] [/me] Token verification failed: ${error.message}`)
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
        verification_url: `${ConfigService.getFrontendUrl()}/auth/device`,
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
