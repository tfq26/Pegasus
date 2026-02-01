import { Hono } from 'hono';

const debugRouter = new Hono();

// Store last error globally
global.lastAIError = null;
global.lastAIRequest = null;

debugRouter.get('/last-error', async (c) => {
    return c.json({
        lastError: global.lastAIError,
        lastRequest: global.lastAIRequest,
        timestamp: new Date().toISOString()
    });
});

debugRouter.post('/clear-error', async (c) => {
    global.lastAIError = null;
    global.lastAIRequest = null;
    return c.json({ success: true });
});

export default debugRouter;
