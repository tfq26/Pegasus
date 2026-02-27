import { logger } from "../services/Logger.js";
import crypto from "node:crypto";

/**
 * Trace Middleware
 * 
 * Generates a unique Request ID for every request and logs 
 * request start/end with duration and status.
 */
export const traceMiddleware = async (c, next) => {
    const start = Date.now();
    const requestId = crypto ? crypto.randomUUID() : Math.random().toString(36).substring(7);

    // Store request ID in context for downstream use
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);

    const { method, url } = c.req;
    logger.info(`Incoming Request: ${method} ${url}`, { requestId });

    try {
        await next();
    } finally {
        const ms = Date.now() - start;
        const status = c.res.status;

        // Log final request result
        const logLevel = status >= 400 ? 'warn' : 'info';
        logger[logLevel](`Request Finished: ${method} ${url} - ${status} (${ms}ms)`, {
            requestId,
            status,
            duration: ms
        });
    }
};
