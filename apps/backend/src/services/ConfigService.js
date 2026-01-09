
export class ConfigService {
    static getFrontendUrl() {
        // Prefer explicit ENV var
        if (process.env.FRONTEND_URL) {
            return process.env.FRONTEND_URL.replace(/\/$/, '');
        }

        const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

        // Production Vercel fallback
        if (isProduction && process.env.VERCEL_URL) {
            return `https://${process.env.VERCEL_URL}`;
        }

        // Local development defaults
        return 'http://localhost:5173';
    }

    static getBackendUrl() {
        if (process.env.BACKEND_URL) {
            return process.env.BACKEND_URL.replace(/\/$/, '');
        }

        if (process.env.VERCEL_URL) {
            return `https://${process.env.VERCEL_URL}`;
        }

        return 'http://localhost:3000';
    }

    static getJwtSecret() {
        return process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_production';
    }

    static getWorkOSConfig() {
        return {
            apiKey: process.env.WORKOS_API_KEY || 'sk_test_placeholder',
            clientId: process.env.WORKOS_CLIENT_ID,
            redirectUri: process.env.WORKOS_REDIRECT_URI || `${this.getBackendUrl()}/auth/callback`
        };
    }

    static isProduction() {
        return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    }
}
