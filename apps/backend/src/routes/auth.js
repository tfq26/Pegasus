import { Hono } from "hono"
import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"
import { db } from "../db/index.js"
import { users, deviceCodes } from "../db/schema.js"
import { eq, sql } from "drizzle-orm"
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

/**
 * [AUTH_TRACE] Renders a nice HTML page that launches the desktop app via custom protocol
 */
const renderLaunchPage = (c, { token, email, deviceCode, traceId }) => {
    const scheme = 'pegasus'
    const redirectUrl = `${scheme}://auth?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
    const apiUrl = ConfigService.getBackendUrl()

    console.log(`[AUTH_TRACE] [${traceId}] Rendering launch page for: ${redirectUrl} (Sync: ${deviceCode || 'none'})`)

    return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Success | Pegasus</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    background: #050505; 
                    color: #fff; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    height: 100vh; 
                    margin: 0; 
                    overflow: hidden;
                }
                .container { 
                    text-align: center; 
                    max-width: 400px; 
                    padding: 40px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 32px;
                    backdrop-filter: blur(20px);
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                }
                .logo { font-size: 48px; margin-bottom: 24px; }
                h1 { font-size: 24px; margin-bottom: 12px; font-weight: 700; background: linear-gradient(to bottom, #fff, #888); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                p { color: #888; margin-bottom: 32px; line-height: 1.5; font-size: 14px; }
                .btn { 
                    display: inline-block; 
                    padding: 14px 32px; 
                    background: #fff; 
                    color: #000; 
                    text-decoration: none; 
                    border-radius: 14px; 
                    font-weight: 700; 
                    transition: all 0.2s;
                    box-shadow: 0 0 20px rgba(255,255,255,0.1);
                }
                .btn:hover { transform: translateY(-2px); box-shadow: 0 5px 25px rgba(255,255,255,0.2); }
                .loading { margin-top: 24px; font-size: 12px; color: #444; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
                @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
                .pulse { animation: pulse 2s infinite; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🚀</div>
                <h1>Success!</h1>
                <p>You've successfully authenticated. We're launching Pegasus to sign you in.</p>
                <a href="${redirectUrl}" class="btn">Launch Pegasus</a>
                <div class="loading pulse">Opening App...</div>
            </div>
            <script>
                // 1. Try to authorize the background session immediately (Silent Fallback)
                const deviceCode = "${deviceCode}";
                if (deviceCode && deviceCode !== "undefined" && deviceCode !== "null") {
                    fetch("${apiUrl}/auth/device/authorize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            device_code: deviceCode,
                            token: "${token}",
                            user: { email: "${email}" }
                        })
                    }).then(res => res.json()).then(data => {
                        console.log("Device session authorized:", data);
                    }).catch(err => {
                        console.error("Failed to authorize device session", err);
                    });
                }

                // 2. Try to launch the app via custom protocol (Instant Track)
                window.location.href = "${redirectUrl}";
                
                // 3. Update UI if auto-launch likely failed
                setTimeout(() => {
                    document.querySelector('.loading').innerText = "Didn't open? Click the button above.";
                }, 3000);
            </script>
        </body>
        </html>
    `)
}

// Helper to ensure user exists in DB
const upsertUser = async (payload, traceId = 'system') => {
    try {
        const userId = payload.sub || payload.id
        console.log(`[AUTH_TRACE] [${traceId}] Syncing user record: ${userId}`)

        const firstName = payload.firstName || payload.first_name || ""
        const lastName = payload.lastName || payload.last_name || ""
        const pic = payload.profilePictureUrl || payload.profile_picture_url || null

        await db.insert(users)
            .values({
                id: userId,
                email: payload.email,
                firstName,
                lastName,
                profilePictureUrl: pic,
                subscriptionTier: 'free',
                purchasedTokens: 0,
                purchasedStorage: 0,
                stripeCustomerId: "",
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

        console.log(`[AUTH_TRACE] [${traceId}] User record synced via Drizzle.`)
    } catch (e) {
        console.error(`[AUTH_TRACE] [${traceId}] Failed to upsert user:`, e.message)
        throw e
    }
}

// Routes
auth.get("/login", async (c) => {
    const returnTo = c.req.query("return_to")
    const traceId = Math.random().toString(36).substring(7)
    const isProduction = ConfigService.isProduction()

    console.log(`[AUTH_TRACE] [${traceId}] Login initiated. return_to: ${returnTo || 'none'}`)

    // DEV MODE BYPASS
    if (process.env.PEGASUS_DEV_MODE === 'true') {
        const frontendUrl = ConfigService.getFrontendUrl()
        const devPayload = {
            sub: 'dev_user',
            email: 'dev@pegasus.ai',
            firstName: 'Developer',
            lastName: 'User',
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 Days
        }
        const devToken = await sign(devPayload, jwtSecret)

        let targetUrl = returnTo || frontendUrl
        const finalRedirect = new URL(targetUrl, frontendUrl)
        finalRedirect.searchParams.set('token', devToken)

        console.log(`[AUTH_TRACE] [${traceId}] [DEV_MODE] Bypassing WorkOS. Redirecting with dev token.`)
        return c.redirect(finalRedirect.toString())
    }

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
        const existingUsers = await db.select()
            .from(users)
            .where(sql`${users.email} = ${user.email} AND ${users.id} != ${user.id}`)

        if (existingUsers.length > 0) {
            const existingId = existingUsers[0].id
            console.log(`[AUTH_TRACE] [${traceId}] Conflict resolution: Removing stale record ${existingId}`)
            await db.delete(users).where(eq(users.id, existingId))
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

        const state = c.req.query("state")
        if (state && (state === 'desktop' || state.length > 20)) {
            return renderLaunchPage(c, {
                token,
                email: user.email,
                deviceCode: state === 'desktop' ? null : state,
                traceId
            })
        }

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

    // DEV MODE BYPASS
    if (process.env.PEGASUS_DEV_MODE === 'true') {
        console.log('[IdentityService] [DEV_MODE] Bypassing auth for /me')
        const mockUser = {
            sub: 'dev_user',
            id: 'dev_user',
            email: 'dev@pegasus.ai',
            firstName: 'Developer',
            lastName: 'User',
            subscription_tier: 'pro_plus',
        }
        // Generate a real token so individual verify() calls in other routes pass
        const devToken = await sign({
            ...mockUser,
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 Days
        }, jwtSecret)

        return c.json({ user: mockUser, token: devToken })
    }

    const token = getAuthToken(c)

    if (!token) {
        return c.json({ user: null })
    }

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // Fetch full user record for live stats (tier, tokens, etc)
        const userRecord = await db.query.users.findFirst({
            where: eq(users.id, userId)
        })

        if (!userRecord) {
            return c.json({ error: "User not found" }, 404)
        }

        // Get user's feature flags
        // For now, we'll need to update experimental-features.js to support Drizzle too
        // const featureFlags = await getUserFeatureFlags(db, userId)
        const featureFlags = []

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
// DESKTOP IN-APP OAUTH (Epic Games style)
// ============================================

/**
 * Desktop login initiator - returns auth URL for WebView
 */
auth.get('/desktop/login', (c) => {
    const traceId = Math.random().toString(36).substring(7)
    const apiUrl = ConfigService.getBackendUrl()
    const provider = c.req.query('provider') || 'authkit'

    console.log(`[AUTH_TRACE] [${traceId}] Desktop login initiated for provider: ${provider}, state: ${c.req.query('state') || 'none'}`)

    // Use dedicated desktop callback
    const desktopRedirectUri = `${apiUrl}/auth/callback`
    const state = c.req.query('state') || 'desktop'

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
        provider: provider === 'authkit' ? 'authkit' : undefined,
        connectionId: provider !== 'authkit' ? provider : undefined,
        clientId,
        redirectUri: desktopRedirectUri,
        state
    })

    return c.json({
        url: authorizationUrl,
        traceId
    })
})

/**
 * Desktop callback - returns HTML that posts token to parent window
 */
auth.get('/desktop/callback', async (c) => {
    const code = c.req.query('code')
    const traceId = Math.random().toString(36).substring(7)
    const apiUrl = ConfigService.getBackendUrl()

    console.log(`[AUTH_TRACE] [${traceId}] Desktop callback received`)

    if (!code) {
        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Failed</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .container { text-align: center; }
                    .error { color: #ef4444; font-size: 24px; margin-bottom: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error">❌ Login Failed</div>
                    <p>No authorization code received.</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
        `)
    }

    try {
        const desktopRedirectUri = `${apiUrl}/auth/callback`

        const { user } = await workos.userManagement.authenticateWithCode({
            code,
            clientId,
            redirectUri: desktopRedirectUri,
        })

        console.log(`[AUTH_TRACE] [${traceId}] Desktop auth success: ${user.email}`)

        // Upsert user in database
        await upsertUser(user, traceId)

        // Create JWT
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

        const state = c.req.query("state")
        return renderLaunchPage(c, {
            token,
            email: user.email,
            deviceCode: state && state !== 'desktop' ? state : null,
            traceId
        })

    } catch (error) {
        console.error(`[AUTH_TRACE] [${traceId}] Desktop auth failure:`, error.message)

        return c.html(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Failed</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0a0a0a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .container { text-align: center; max-width: 400px; }
                    .error { color: #ef4444; font-size: 48px; margin-bottom: 16px; }
                    .message { color: #888; font-size: 14px; margin-top: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error">✕</div>
                    <h2>Login Failed</h2>
                    <p>${error.message}</p>
                    <p class="message">Please close this window and try again.</p>
                </div>
            </body>
            </html>
        `)
    }
})

// ============================================
// DEVICE AUTHORIZATION FLOW (for Desktop Apps)
// ============================================


// ============================================
// DEVICE AUTHORIZATION FLOW (for Desktop Apps)
// ============================================

auth.post('/device/code', async (c) => {
    const userCode = crypto.randomUUID().slice(0, 8).toUpperCase()
    const deviceCode = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000))

    try {
        await db.insert(deviceCodes).values({
            id: deviceCode,
            userCode,
            status: 'pending',
            expiresAt
        })

        return c.json({
            device_code: deviceCode,
            user_code: userCode,
            verification_url: `${ConfigService.getFrontendUrl()}/auth/device`,
            expires_in: 600
        })
    } catch (e) {
        console.error('[DeviceAuth] Failed to create device code:', e)
        return c.json({ error: 'server_error' }, 500)
    }
})

auth.get('/device/token', async (c) => {
    const deviceCode = c.req.query('device_code')

    if (!deviceCode) {
        return c.json({ error: 'device_code required' }, 400)
    }

    try {
        const session = await db.query.deviceCodes.findFirst({
            where: eq(deviceCodes.id, deviceCode)
        })

        if (!session) {
            return c.json({ error: 'expired_token', error_description: 'Device code not found or expired' }, 400)
        }

        if (new Date() > session.expiresAt) {
            console.log(`[DeviceAuth] Session expired`)
            await db.delete(deviceCodes).where(eq(deviceCodes.id, session.id))
            return c.json({ error: 'expired_token', error_description: 'Device code expired' }, 400)
        }

        if (session.status === 'pending') {
            return c.json({ error: 'authorization_pending' }, 400)
        }

        if (session.status === 'authorized' && session.accessToken) {
            console.log(`[DeviceAuth] Token retrieved`)
            await db.delete(deviceCodes).where(eq(deviceCodes.id, session.id))
            return c.json({
                access_token: session.accessToken,
                token_type: 'Bearer',
                user: session.user
            })
        }

        return c.json({ error: 'authorization_pending' }, 400)
    } catch (e) {
        console.error('[DeviceAuth] Check token failed:', e)
        return c.json({ error: 'server_error' }, 500)
    }
})

auth.post('/device/authorize', async (c) => {
    const { device_code, token, user } = await c.req.json()

    console.log(`[DeviceAuth] Authorize request for device_code: ${device_code}`)

    if (!device_code || !token) {
        console.log('[DeviceAuth] Missing device_code or token')
        return c.json({ error: 'device_code and token required' }, 400)
    }

    try {
        // Find session by device code (the record ID)
        console.log(`[DeviceAuth] Looking up record for code: ${device_code}`)

        const [result] = await db.query(`SELECT * FROM type::thing('device_code', $deviceCode)`, { deviceCode: device_code })
        console.log(`[DeviceAuth] Query result:`, JSON.stringify(result))

        const session = result && result[0]

        if (!session) {
            console.log('[DeviceAuth] Session not found')
            return c.json({ error: 'Invalid or expired code' }, 400)
        }

        if (session.status !== 'pending') {
            console.log(`[DeviceAuth] Session status is '${session.status}', expected 'pending'`)
            return c.json({ error: 'Code already used or expired' }, 400)
        }

        // Update session
        console.log(`[DeviceAuth] Authorizing session: ${session.id}`)
        await db.query(`UPDATE $id SET status = 'authorized', access_token = $accessToken, user = $user`, {
            id: session.id,
            accessToken: token,
            user
        })

        console.log('[DeviceAuth] Session authorized successfully')
        return c.json({ success: true, message: 'Device authorized! You can close this window.' })
    } catch (e) {
        console.error('[DeviceAuth] Authorize failed:', e)
        return c.json({ error: 'server_error' }, 500)
    }
})

auth.get('/device/verify', async (c) => {
    const code = c.req.query('code')

    if (code) {
        try {
            const [result] = await db.query(`SELECT * FROM device_code WHERE user_code = $code AND status = 'pending'`, {
                code: code.toUpperCase()
            })

            if (result && result.length > 0) {
                return c.json({ valid: true, code: code.toUpperCase() })
            }
        } catch (e) {
            console.error('[DeviceAuth] Verify failed:', e)
        }
    }

    return c.json({ valid: false })
})

export { auth as authRoutes }
