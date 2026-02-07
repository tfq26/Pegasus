import { Hono } from 'hono';
import { secretService } from '../services/SecretService.js';
import crypto from 'crypto';

const cloudAuth = new Hono();

// In-memory state storage (in production, use Redis or database)
const oauthStates = new Map();

// Azure OAuth Configuration
const AZURE_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_OAUTH_CLIENT_SECRET;
const AZURE_REDIRECT_URI = process.env.AZURE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/cloud-auth/azure/callback';
const AZURE_TENANT = process.env.AZURE_OAUTH_TENANT || 'common'; // 'common' for multi-tenant

// GCP OAuth Configuration
const GCP_CLIENT_ID = process.env.GCP_OAUTH_CLIENT_ID;
const GCP_CLIENT_SECRET = process.env.GCP_OAUTH_CLIENT_SECRET;
const GCP_REDIRECT_URI = process.env.GCP_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/cloud-auth/gcp/callback';

// AWS Configuration
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_OAUTH_CLIENT_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_OAUTH_CLIENT_SECRET;
const AWS_REDIRECT_URI = process.env.AWS_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/cloud-auth/aws/callback';

/**
 * Azure OAuth Initiation
 * Redirects user to Azure AD consent screen
 */
cloudAuth.get('/azure/init', async (c) => {
    try {
        // Get user ID from session/auth
        const userId = c.req.query('user_id'); // Get from query parameter

        if (!userId) {
            return c.json({ error: 'User not authenticated' }, 401);
        }

        // Generate state parameter for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, { userId, timestamp: Date.now() });

        // Clean up old states (older than 10 minutes)
        for (const [key, value] of oauthStates.entries()) {
            if (Date.now() - value.timestamp > 600000) {
                oauthStates.delete(key);
            }
        }

        // Azure AD OAuth URL
        const authUrl = new URL(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/authorize`);
        authUrl.searchParams.set('client_id', AZURE_CLIENT_ID);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', AZURE_REDIRECT_URI);
        authUrl.searchParams.set('response_mode', 'query');
        authUrl.searchParams.set('scope', 'https://management.azure.com/user_impersonation');
        authUrl.searchParams.set('state', state);

        return c.redirect(authUrl.toString());
    } catch (error) {
        console.error('[Azure OAuth Init] Error:', error);
        return c.json({ error: 'Failed to initiate OAuth flow' }, 500);
    }
});

/**
 * Azure OAuth Callback
 * Handles the redirect from Azure AD and exchanges code for tokens
 */
cloudAuth.get('/azure/callback', async (c) => {
    try {
        const code = c.req.query('code');
        const state = c.req.query('state');
        const error = c.req.query('error');
        const errorDescription = c.req.query('error_description');

        // Handle OAuth errors
        if (error) {
            console.error('[Azure OAuth Callback] OAuth error:', error, errorDescription);
            return c.html(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>${errorDescription || error}</p>
                        <script>
                            setTimeout(() => window.close(), 3000);
                        </script>
                    </body>
                </html>
            `);
        }

        // Verify state parameter
        const stateData = oauthStates.get(state);
        if (!stateData) {
            return c.json({ error: 'Invalid state parameter' }, 400);
        }

        const { userId } = stateData;
        oauthStates.delete(state);

        // Exchange authorization code for tokens
        const tokenResponse = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: AZURE_CLIENT_ID,
                client_secret: AZURE_CLIENT_SECRET,
                code: code,
                redirect_uri: AZURE_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            console.error('[Azure OAuth Callback] Token exchange failed:', errorData);
            return c.json({ error: 'Failed to exchange code for tokens' }, 500);
        }

        const tokens = await tokenResponse.json();

        // Store tokens in Vault
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        await secretService.storeSecret(vaultKey, JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope,
            created_at: Date.now(),
        }));

        console.log(`[Azure OAuth Callback] Tokens stored for user ${userId}`);

        // Close the popup window and notify parent
        return c.html(`
            <html>
                <body>
                    <h1>Authorization Successful!</h1>
                    <p>You can close this window.</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({ type: 'azure-oauth-success', provider: 'azure' }, '*');
                        }
                        setTimeout(() => window.close(), 2000);
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('[Azure OAuth Callback] Error:', error);
        return c.json({ error: 'Internal server error' }, 500);
    }
});

/**
 * Get Azure OAuth Status
 * Check if user has connected their Azure account
 */
cloudAuth.get('/azure/status', async (c) => {
    try {
        const userId = c.req.header('x-user-id');

        if (!userId) {
            return c.json({ connected: false, error: 'User ID missing in request' });
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            return c.json({ connected: false });
        }

        const tokens = JSON.parse(tokenData);
        if (tokens.disconnected) {
            return c.json({ connected: false });
        }
        const isExpired = Date.now() - tokens.created_at > (tokens.expires_in * 1000);

        return c.json({
            connected: true,
            expired: isExpired,
            scope: tokens.scope,
        });
    } catch (error) {
        console.error('[Azure OAuth Status] Error:', error);
        return c.json({ connected: false });
    }
});

/**
 * Disconnect Azure Account
 * Remove stored tokens
 */
cloudAuth.delete('/azure/disconnect', async (c) => {
    try {
        const userId = c.req.header('x-user-id');

        if (!userId) {
            return c.json({ error: 'User not authenticated' }, 401);
        }

        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        await secretService.deleteSecret(vaultKey);

        return c.json({ success: true });
    } catch (error) {
        console.error('[Azure OAuth Disconnect] Error:', error);
        return c.json({ error: 'Failed to disconnect' }, 500);
    }
});

/**
 * AWS Auth Initiation
 * Directly stores credentials from environment variables.
 * No mock values - real credentials required.
 */
cloudAuth.get('/aws/init', async (c) => {
    try {
        const userId = c.req.query('user_id');
        if (!userId) return c.json({ error: 'User not authenticated' }, 401);

        // Read credentials directly from environment
        const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_OAUTH_CLIENT_ID;
        const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_OAUTH_CLIENT_SECRET;
        const region = process.env.AWS_REGION || 'us-east-1';

        console.log('[AWS Init] Environment check:');
        console.log('  AWS_ACCESS_KEY_ID:', accessKey ? `${accessKey.substring(0, 4)}...` : 'NOT SET');
        console.log('  AWS_OAUTH_CLIENT_ID:', process.env.AWS_OAUTH_CLIENT_ID ? `${process.env.AWS_OAUTH_CLIENT_ID.substring(0, 4)}...` : 'NOT SET');

        if (!accessKey || !secretKey) {
            console.error('[AWS Init] Missing AWS credentials in environment!');
            return c.html(`
                <html><body>
                    <h1>AWS Configuration Error</h1>
                    <p>AWS credentials not found in environment variables.</p>
                    <p>Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.</p>
                    <script>setTimeout(() => window.close(), 5000);</script>
                </body></html>
            `);
        }

        // Store credentials directly (no redirect dance needed)
        const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
        await secretService.storeSecret(vaultKey, JSON.stringify({
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            region: region,
            created_at: Date.now(),
        }));

        console.log(`[AWS Init] Stored credentials for ${userId}. Key: ${accessKey.substring(0, 4)}..., Region: ${region}`);

        return c.html(`
            <html><body><h1>AWS Account Connected!</h1>
            <p>Using Access Key: ${accessKey.substring(0, 4)}****</p>
            <script>
                if (window.opener) window.opener.postMessage({ type: 'aws-oauth-success', provider: 'aws' }, '*');
                setTimeout(() => window.close(), 1500);
            </script></body></html>
        `);
    } catch (error) {
        console.error('[AWS Init] Error:', error);
        return c.json({ error: 'Failed to connect AWS' }, 500);
    }
});

// Keep callback for legacy but it just redirects to init
cloudAuth.get('/aws/callback', async (c) => {
    const userId = c.req.query('user_id');
    return c.redirect(`/api/cloud-auth/aws/init?user_id=${userId}`);
});

cloudAuth.get('/aws/status', async (c) => {
    try {
        const userId = c.req.header('x-user-id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        return c.json({ connected: !!tokenData });
    } catch (error) {
        return c.json({ connected: false });
    }
});

cloudAuth.delete('/aws/disconnect', async (c) => {
    try {
        const userId = c.req.header('x-user-id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/aws/token`;
        await secretService.deleteSecret(vaultKey);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Failed to disconnect' }, 500);
    }
});

/**
 * GCP OAuth Initiation
 */
cloudAuth.get('/gcp/init', async (c) => {
    try {
        const userId = c.req.query('user_id');
        if (!userId) return c.json({ error: 'User not authenticated' }, 401);

        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, { userId, provider: 'gcp', timestamp: Date.now() });

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GCP_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', GCP_REDIRECT_URI);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/cloud-platform openid email profile');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', state);

        return c.redirect(authUrl.toString());
    } catch (error) {
        console.error('[GCP OAuth Init] Error:', error);
        return c.json({ error: 'Failed to initiate GCP OAuth' }, 500);
    }
});

cloudAuth.get('/gcp/callback', async (c) => {
    try {
        const code = c.req.query('code');
        const state = c.req.query('state');
        const error = c.req.query('error');

        if (error) return c.json({ error }, 400);

        const stateData = oauthStates.get(state);
        if (!stateData) return c.json({ error: 'Invalid state' }, 400);

        const { userId } = stateData;
        oauthStates.delete(state);

        // Exchange code for tokens
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GCP_CLIENT_ID,
                client_secret: GCP_CLIENT_SECRET,
                redirect_uri: GCP_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!response.ok) throw new Error(await response.text());
        const tokens = await response.json();

        // Store in Vault
        const vaultKey = `secret/pegasus/users/${userId}/cloud/gcp/token`;
        await secretService.storeSecret(vaultKey, JSON.stringify({
            ...tokens,
            created_at: Date.now(),
        }));

        return c.html(`
            <html><body><h1>GCP Account Connected!</h1><script>
                if (window.opener) window.opener.postMessage({ type: 'gcp-oauth-success', provider: 'gcp' }, '*');
                setTimeout(() => window.close(), 1500);
            </script></body></html>
        `);
    } catch (error) {
        console.error('[GCP OAuth Callback] Error:', error);
        return c.json({ error: 'Failed GCP token exchange' }, 500);
    }
});

cloudAuth.get('/gcp/status', async (c) => {
    try {
        const userId = c.req.header('x-user-id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/gcp/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        return c.json({ connected: !!tokenData });
    } catch (error) {
        return c.json({ connected: false });
    }
});

cloudAuth.delete('/gcp/disconnect', async (c) => {
    try {
        const userId = c.req.header('x-user-id');
        const vaultKey = `secret/pegasus/users/${userId}/cloud/gcp/token`;
        await secretService.deleteSecret(vaultKey);
        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: 'Failed to disconnect' }, 500);
    }
});

export default cloudAuth;
