import { Hono } from 'hono';
import { aiClient } from '../../ai/AIClient.js';
import { EntitlementService } from '../services/EntitlementService.js';
import { db } from '../db/index.js';
import { secretService } from '../services/SecretService.js';
import { spreadsheetToolService } from '../services/SpreadsheetToolService.js';
import { authMiddleware } from '../middleware/auth.js';

const aiRoutes = new Hono();
aiRoutes.use('*', authMiddleware);
const entitlementService = new EntitlementService(db);

/**
 * GET /config
 * Get current AI configuration (User Preference)
 */
aiRoutes.get('/config', async (c) => {
    try {
        const userId = c.get('userId') || c.req.header('x-user-id');
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const vaultKey = `secret/pegasus/users/${userId}/ai/config`;
        const configStr = await secretService.resolveSecret(`vault://${vaultKey}`);

        return c.json(configStr ? JSON.parse(configStr) : { provider: 'default' });
    } catch (error) {
        console.error('[AI Config] Error getting config:', error);
        return c.json({ error: 'Failed to fetch AI config' }, 500);
    }
});

/**
 * POST /config
 * Set AI Provider preference (Gated feature)
 */
aiRoutes.post('/config', async (c) => {
    try {
        const userId = c.get('userId') || c.req.header('x-user-id');
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        const { provider, modelId } = await c.req.json();

        // 1. Enterprise Gate Check
        if (provider !== 'default') {
            const hasAccess = await entitlementService.hasFeature(userId, 'byom_models');
            if (!hasAccess) {
                return c.json({
                    error: 'Custom AI Models are available on Teams & Enterprise plans only.',
                    upgradeRequired: true
                }, 403);
            }
        }

        // 2. Save Preference
        const vaultKey = `secret/pegasus/users/${userId}/ai/config`;
        await secretService.storeSecret(vaultKey, JSON.stringify({
            provider,
            modelId, // e.g. 'aws:anthropic.claude-3...'
            updated_at: Date.now()
        }));

        return c.json({ success: true, message: 'AI preference updated' });
    } catch (error) {
        console.error('[AI Config] Error setting config:', error);
        return c.json({ error: 'Failed to update AI config' }, 500);
    }
});

/**
 * GET /models
 * List available models based on user tier and connections
 */
aiRoutes.get('/models', async (c) => {
    try {
        const userId = c.get('userId') || c.req.header('x-user-id');
        if (!userId) return c.json({ error: 'Unauthorized' }, 401);

        // Fetch models from AIClient (which now checks connected accounts)
        const models = await aiClient.listModels(userId);

        // Filter based on entitlement
        const tier = await entitlementService.getTier(userId);
        const hasByomAccess = await entitlementService.hasFeature(userId, 'byom_models');

        const allowedModels = models.filter(m => {
            if (m.id === 'gemini-2.5-flash' || m.id === 'gemini-2.5-pro') {
                return tier === 'free';
            }
            if (m.id === 'gemini-3-flash-preview' || m.id === 'gemini-3-pro-preview') {
                return tier !== 'free';
            }
            return true;
        });

        const visibleModels = allowedModels.map(m => {
            const isByom = m.id.startsWith('aws:') || m.id.startsWith('azure:') || m.id.startsWith('gcp:');
            return {
                ...m,
                locked: isByom && !hasByomAccess
            };
        });

        return c.json({ models: visibleModels });
    } catch (error) {
        console.error('[AI Models] Error listing models:', error);
        return c.json({ error: 'Failed to list models', models: [] }, 500);
    }
});

/**
 * POST /query
 * Execute a structured AI command for Data Studio
 */
aiRoutes.post('/query', async (c) => {
    try {
        const userId = c.get('userId') || c.req.header('x-user-id') || 'dev_user';
        const { query } = await c.req.json();

        if (!query) return c.json({ error: 'Query is required' }, 400);

        // Hardcode to gemini-3-flash-preview for efficiency as requested
        const targetModel = 'gemini-3-flash-preview';

        console.log(`[AI Query] Executing for ${userId}: ${query.substring(0, 50)}...`);

        const response = await aiClient.generateContent([
            { role: 'user', content: query }
        ], {
            model: targetModel,
            userId,
            json: true // Ensure we get JSON back if possible
        });

        return c.json({
            result: response.text || response,
            usage: response.usage
        });
    } catch (error) {
        console.error('[AI Query] Error:', error);
        return c.json({ error: 'AI request failed', details: error.message }, 500);
    }
});

export default aiRoutes;
