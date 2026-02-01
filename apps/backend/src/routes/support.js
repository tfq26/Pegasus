import { Hono } from 'hono';
import { supportDb } from '../db/supportDb.js';
import { supportReports } from '../db/schema.js';

const supportRoutes = new Hono();

supportRoutes.post('/report', async (c) => {
    try {
        const { url, errorCode, errorMessage, errorDetails, metadata, userId } = await c.req.json();

        const [report] = await supportDb.insert(supportReports).values({
            userId: userId || null,
            url,
            errorCode: String(errorCode),
            errorMessage,
            errorDetails,
            metadata: metadata || {}
        }).returning();

        console.log(`[Support] New error report received: ${report.id} (${errorCode})`);

        return c.json({
            success: true,
            id: report.id,
            message: 'Report sent to support successfully'
        });
    } catch (error) {
        console.error('[Support] Error saving report:', error.message);
        return c.json({ error: 'Failed to send report to support' }, 500);
    }
});

export default supportRoutes;
