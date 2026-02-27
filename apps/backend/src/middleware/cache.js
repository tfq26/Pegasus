import { logger } from "../services/Logger.js";

const cache = new Map();

/**
 * Cache Middleware
 * 
 * Provides simple in-memory caching for GET requests.
 * @param {Object} options - Cache options (ttl in ms)
 */
export const cacheMiddleware = (options = {}) => {
    const { ttl = 60000 * 5 } = options; // Default 5 mins

    return async (c, next) => {
        // Only cache GET requests
        if (c.req.method !== 'GET') return await next();

        const url = c.req.url;
        const requestId = c.get('requestId');
        const cached = cache.get(url);

        if (cached && Date.now() < cached.expires) {
            logger.debug(`Cache Hit: ${url}`, { requestId });
            return c.json(cached.data);
        }

        await next();

        if (c.res.status === 200) {
            try {
                // Clone the response to read body without consuming it
                const data = await c.res.clone().json();
                cache.set(url, {
                    data,
                    expires: Date.now() + ttl
                });
                logger.debug(`Cache Set: ${url}`, { requestId, ttl });
            } catch (e) {
                // Not a JSON response, skip caching
            }
        }
    };
};

/**
 * Helper to clear cache (e.g. on updates)
 */
export const clearCache = (urlPattern) => {
    if (!urlPattern) {
        cache.clear();
        logger.info('Global cache cleared');
        return;
    }

    for (const key of cache.keys()) {
        if (key.includes(urlPattern)) {
            cache.delete(key);
            logger.info(`Cache cleared for pattern: ${urlPattern}`);
        }
    }
};
