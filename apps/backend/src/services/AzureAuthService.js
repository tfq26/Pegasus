import { secretService } from './SecretService.js';

const AZURE_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_OAUTH_CLIENT_SECRET;
const AZURE_TENANT = process.env.AZURE_OAUTH_TENANT || 'common';

export class AzureAuthService {
    /**
     * Get an access token for a specific scope (audience)
     * If current token's scope doesn't match, we exchange the refresh token
     */
    static async getAccessTokenForScope(userId, targetScope) {
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const tokenData = await secretService.resolveSecret(`vault://${vaultKey}`);

        if (!tokenData) {
            throw new Error('Azure account not connected');
        }

        const tokens = JSON.parse(tokenData);

        // If current scope includes target scope and not expired, use it
        // Note: targetScope usually is just the base URL like https://kusto.kusto.windows.net/.default
        const currentScopes = tokens.scope || '';
        const isExpired = Date.now() - tokens.created_at > (tokens.expires_in * 1000);

        if (currentScopes.includes(targetScope) && !isExpired) {
            console.log(`[AzureAuthService] Using existing token for scope: ${targetScope}`);
            return tokens.access_token;
        }

        // Otherwise, exchange refresh token for new scope
        console.log(`[AzureAuthService] Exchanging refresh token for scope: ${targetScope}`);
        return await this.refreshAndExchangeToken(userId, tokens.refresh_token, targetScope);
    }

    static async refreshAndExchangeToken(userId, refreshToken, scope) {
        if (!refreshToken) {
            throw new Error('No refresh token available. Please reconnect Azure.');
        }

        const response = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: AZURE_CLIENT_ID,
                client_secret: AZURE_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                scope: scope,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[AzureAuthService] Token exchange failed:', error);
            throw new Error('Failed to obtain scoped Azure token');
        }

        const newTokens = await response.json();

        // Update stored tokens with new access_token, but KEEP the refresh_token if not provided
        const vaultKey = `secret/pegasus/users/${userId}/cloud/azure/token`;
        const oldTokenData = await secretService.resolveSecret(`vault://${vaultKey}`);
        const oldTokens = oldTokenData ? JSON.parse(oldTokenData) : {};

        await secretService.storeSecret(vaultKey, JSON.stringify({
            ...oldTokens,
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || oldTokens.refresh_token,
            expires_in: newTokens.expires_in,
            token_type: newTokens.token_type,
            scope: newTokens.scope,
            created_at: Date.now(),
        }));

        return newTokens.access_token;
    }
}
