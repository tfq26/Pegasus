import path from "node:path";
import { access } from "node:fs/promises";
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
                // IMPORTANT: Before returning a signed URL, we should verify it exists if we want to be safe,
                // but that adds latency. Instead, we'll let the caller handle failures.
                // HOWEVER, for dev environments, let's check local demo-data FIRST if it matches the filename.
                const filename = path.basename(dbPath);
                // Try Project Root (Parent of apps/backend) then CWD
                const projectRoot = path.resolve(process.cwd(), '..', '..');
                const demoPath = path.resolve(projectRoot, 'demo-data', filename);
                const localDemoPath = path.resolve(process.cwd(), 'demo-data', filename);

                try {
                    await access(demoPath);
                    console.log(`[resolveDatabasePath] Found ${filename} in project root demo-data.`);
                    return demoPath;
                } catch (e) {
                    try {
                        await access(localDemoPath);
                        return localDemoPath;
                    } catch (e2) { /* not in demo-data */ }
                }

                const url = await StorageManager.getPublicUrl(userId, dbPath);
                if (url) return url;
            }

            // This ensures it is downloaded to local cache if remote
            // StorageManager.getLocalPath returns an absolute path
            return await StorageManager.getLocalPath(userId, dbPath);
        } catch (e) {
            console.warn(`[resolveDatabasePath] Failed to resolve via StorageManager: ${e.message}. Falling back to legacy/demo resolution.`);

            // 1. Check demo-data (Top Priority for dev/test)
            const filename = path.basename(dbPath);
            const projectRoot = path.resolve(process.cwd(), '..', '..');

            // Try different variants of the filename in demo-data
            const possibleFilenames = [filename];

            // If the filename has a UUID-like prefix (e.g. uuid-name.csv), try just the name
            if (filename.includes('-')) {
                const parts = filename.split('-');
                if (parts.length > 1) {
                    // Try removing the first part (often a single UUID segment or a full UUID)
                    possibleFilenames.push(parts.slice(1).join('-'));
                    // Try removing everything before the LAST dash if it's a long UUID prefix
                    // (Actually, usually it's [uuid]-[name], so slice(1) is good)
                }
            }

            // Also try removing common patterns like 'uploads_' or 'data_' if they exist
            if (filename.startsWith('uploads_')) possibleFilenames.push(filename.replace('uploads_', ''));
            if (filename.startsWith('data_')) possibleFilenames.push(filename.replace('data_', ''));

            for (const f of [...new Set(possibleFilenames)]) {
                const demoPath = path.resolve(projectRoot, 'demo-data', f);
                const localDemoPath = path.resolve(process.cwd(), 'demo-data', f);

                try {
                    await access(demoPath);
                    console.log(`[resolveDatabasePath] Fallback: Found ${f} in project root demo-data.`);
                    return demoPath;
                } catch (e) {
                    try {
                        await access(localDemoPath);
                        console.log(`[resolveDatabasePath] Fallback: Found ${f} in local demo-data.`);
                        return localDemoPath;
                    } catch (e2) { /* keep trying */ }
                }
            }

            // 2. Legacy local resolution
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
