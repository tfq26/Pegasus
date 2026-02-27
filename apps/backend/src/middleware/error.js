import { logger } from "../services/Logger.js";

/**
 * Global Error Handling Middleware
 * 
 * Catches all unhandled exceptions, logs them with context,
 * and returns a standardized JSON response.
 */
export const errorMiddleware = async (err, c) => {
    const requestId = c.get('requestId');

    // Log the error
    logger.error('Unhandled Exception caught by middleware', err, { requestId });

    // Determine status code
    const status = err.status || (err.message?.includes('Unauthorized') ? 401 : 500);

    // Prepare response
    const response = {
        error: true,
        message: err.message || 'Internal Server Error',
        requestId
    };

    // Include stack trace in dev mode
    if (process.env.PEGASUS_DEV_MODE === 'true' || process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
    }

    return c.json(response, status);
};
