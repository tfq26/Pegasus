import { db } from '../db/index.js';
import { userPayments } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAuthToken } from '../../lib/auth.js';
import { verify } from 'hono/jwt';
import { ConfigService } from '../services/ConfigService.js';

const jwtSecret = ConfigService.getJwtSecret();

export const getPayments = async (c) => {
    try {
        const token = getAuthToken(c);
        if (!token) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const payload = await verify(token, jwtSecret);
        if (!payload || !payload.sub) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const userId = payload.sub;

        console.log('[Payments API] Fetching payments for user:', userId);

        // Use standard select query instead of relational query
        const results = await db.select()
            .from(userPayments)
            .where(eq(userPayments.userId, userId))
            .orderBy(desc(userPayments.createdAt))
            .limit(50);

        console.log('[Payments API] Found', results.length, 'payments');

        return c.json({
            success: true,
            payments: results || []
        });
    } catch (err) {
        console.error('[Payments API] Error:', err.message);
        console.error('[Payments API] Stack:', err.stack);
        return c.json({ error: 'Failed to fetch payments' }, 500);
    }
};
