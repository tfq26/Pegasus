
import { Surreal } from 'surrealdb.js';

// Singleton instance
export const surreal = new Surreal();

const SURREAL_URL = import.meta.env.VITE_SURREAL_URL || 'ws://localhost:8000/rpc';
const SURREAL_NS = import.meta.env.VITE_SURREAL_NS || 'test';
const SURREAL_DB = import.meta.env.VITE_SURREAL_DB || 'test';
const SURREAL_USER = import.meta.env.VITE_SURREAL_USER || 'root';
const SURREAL_PASS = import.meta.env.VITE_SURREAL_PASS || 'root';

export const connectToSurreal = async () => {
    try {
        // Check if already connected (status is usually exposed, or try/catch)
        // With surrealdb.js v1, we can check status or just try/catch
        if (surreal.status === 'connected') { // hypothetical status check or just try
            return true;
        }

        console.log('[Surreal] Connecting to', SURREAL_URL);

        await surreal.connect(SURREAL_URL, {
            namespace: SURREAL_NS,
            database: SURREAL_DB,
            auth: {
                username: SURREAL_USER,
                password: SURREAL_PASS
            }
        });

        console.log('[Surreal] Connected successfully');
        return true;
    } catch (e: any) {
        if (e.message && e.message.includes('already connected')) {
            return true;
        }
        console.error('[Surreal] Connection failed:', e);
        return false;
    }
};

export const closeSurreal = async () => {
    await surreal.close();
};
