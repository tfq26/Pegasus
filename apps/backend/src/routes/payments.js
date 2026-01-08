import { db } from '../../db/surreal.js';
import { getAuthToken } from '../../lib/auth.js';
import { verify } from 'hono/jwt';

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production";

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

        const sub = payload.sub || '';
        const rawId = sub.includes(':') ? sub.split(':')[1] : sub;
        const userId = `user:${rawId}`;



        // Fetch user payments - RLS allows this query to only return the user's records
        const [payments] = await db.query(`
            SELECT * FROM user_payment 
            WHERE user = type::thing('user', $rawId)
            ORDER BY created_at DESC 
            LIMIT 50
        `, { rawId });




        return c.json({
            success: true,
            payments: payments || []
        });
    } catch (err) {
        console.error('[Payments API] Error:', err.message);
        return c.json({ error: 'Failed to fetch payments' }, 500);
    }
};
