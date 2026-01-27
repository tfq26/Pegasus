import path from "node:path";
import { StorageManager } from "../services/storage/StorageManager.js";

/**
 * Resolves a database or file path string to an absolute local file path.
 * Handles 'uploads/' keys by downloading from S3/Storage via StorageManager.
 * Handles local paths by resolving relative to process.cwd() or data/storage.
 * 
 * @param {string} dbPath - The path string from configuration
 * @param {string} userId - The user ID for tenant isolation/access checks
 * @param {object} options - Resolution options
 * @param {boolean} options.preferSignedUrl - If true, returns a signed URL for remote storage instead of downloading
 * @returns {Promise<string>} Absolute local file path or remote URL
 */
export async function resolveDatabasePath(dbPath, userId = 'system', options = {}) {
    if (!dbPath || dbPath === ':memory:') return ':memory:';

    // Check for remote URL (LibSQL / Turso / HTTP)
    if (dbPath.startsWith('http') || dbPath.startsWith('libsql')) {
        return dbPath; // Return as-is for remote connection
    }

    // If it looks like a managed upload (Pegasus storage convention)
    if (dbPath.startsWith('uploads/')) {
        try {
            if (options.preferSignedUrl) {
                const url = await StorageManager.getPublicUrl(userId, dbPath);
                if (url) return url;
            }

            // This ensures it is downloaded to local cache if remote
            // StorageManager.getLocalPath returns an absolute path
            return await StorageManager.getLocalPath(userId, dbPath);
        } catch (e) {
            console.warn(`[resolveDatabasePath] Failed to resolve via StorageManager: ${e.message}. Falling back to legacy local resolution.`);
            // Fallback for purely local dev environments without proper storage config
            return path.resolve(process.cwd(), 'data', 'storage', dbPath);
        }
    }

    // It is a local path (absolute or relative)
    if (path.isAbsolute(dbPath)) {
        return dbPath;
    }

    // Relative path? Assume relative to CWD
    return path.resolve(process.cwd(), dbPath);
}
