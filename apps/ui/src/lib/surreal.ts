
import { Surreal } from 'surrealdb.js';

// Singleton instance
export const surreal = new Surreal();

const SURREAL_URL = import.meta.env.VITE_SURREAL_URL || 'ws://localhost:8000/rpc';
const SURREAL_NS = import.meta.env.VITE_SURREAL_NS || 'test';
const SURREAL_DB = import.meta.env.VITE_SURREAL_DB || 'test';
const SURREAL_USER = import.meta.env.VITE_SURREAL_USER || 'root';
const SURREAL_PASS = import.meta.env.VITE_SURREAL_PASS || 'root';

let lastAttemptTime = 0;
let isConnecting = false;
const ATTEMPT_COOLDOWN = 10000; // 10 seconds

export const connectToSurreal = async () => {
    // Correct status check for surreallDB v1.x
    if (surreal.status === 'connected' as any) return true;
    if (isConnecting) return false;

    const now = Date.now();
    if (now - lastAttemptTime < ATTEMPT_COOLDOWN) {
        return false;
    }

    isConnecting = true;
    lastAttemptTime = now;

    try {
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
        if (e.message && (e.message.includes('fetch') || e.message.includes('VersionRetrievalFailure') || e.message.includes('Socket closed') || e.message.includes('transport'))) {
            console.warn('[Surreal] Realtime sync unreachable (local SurrealDB not running)');
        } else {
            console.error('[Surreal] Connection failed:', e);
        }
        return false;
    } finally {
        isConnecting = false;
    }
};

export const closeSurreal = async () => {
    await surreal.close();
};
