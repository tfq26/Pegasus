import { Hono } from 'hono';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { aiClient } from '../../ai/AIClient.js';
import { GroundedSummaryService } from '../v2/services/GroundedSummaryService.js';
import { SummaryPlanningService } from '../v2/services/SummaryPlanningService.js';

const v2 = new Hono();

v2.use('*', authMiddleware);

v2.get('/health', (c) => c.json({ ok: true, version: 'v2' }));

v2.post('/answers/summary', requireUser, async (c) => {
    try {
        const userId = c.get('userId');
        const body = await c.req.json();
        const prompt = String(body?.prompt || '').trim();
        const connectionId = String(body?.connectionId || '').trim();
        const model = body?.model || 'openai';
        const tableHint = body?.table || null;

        if (!prompt) {
            return c.json({ error: 'prompt is required' }, 400);
        }
        if (!connectionId) {
            return c.json({ error: 'connectionId is required' }, 400);
        }

        const service = new GroundedSummaryService({
            aiClient,
            planningService: new SummaryPlanningService({ aiClient })
        });

        const result = await service.answer({ userId, connectionId, prompt, model, tableHint });
        return c.json(result);
    } catch (error) {
        return c.json({ error: error.message || 'v2 summary failed' }, 500);
    }
});

export default v2;
