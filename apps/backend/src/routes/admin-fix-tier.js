import { Hono } from 'hono';
import { db } from '../db/index.js';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
const stripe = new Stripe(stripeSecretKey);
const adminFix = new Hono();

// TEMPORARY: Fix subscription tier for user based on payment history
adminFix.post('/fix-tier/:userId', async (c) => {
    try {
        const userId = c.req.param('userId');
        const dbUserId = userId.startsWith('user:') ? userId : `user:${userId}`;

        console.log(`[Admin Fix] Fixing tier for ${dbUserId}`);

        // 1. Find Pro subscription payment
        const [payments] = await db.query(`
            SELECT * FROM user_payment 
            WHERE user = type::thing('user', $rawId)
            AND description CONTAINS 'Pro Subscription'
            ORDER BY created_at DESC
            LIMIT 1
        `, { rawId: userId.replace('user:', '') });

        if (!payments || payments.length === 0) {
            return c.json({ error: 'No Pro subscription payment found' }, 404);
        }

        const payment = payments[0];
        console.log(`[Admin Fix] Found payment:`, payment);

        // 2. Get Stripe session to find customer ID
        const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id);
        const stripeCustomerId = session.customer;

        console.log(`[Admin Fix] Stripe customer ID: ${stripeCustomerId}`);

        // 3. Update user record
        await db.query(`
            UPDATE ${dbUserId} SET 
                subscription_tier = 'pro',
                stripe_customer_id = $customerId
        `, { customerId: stripeCustomerId });

        console.log(`[Admin Fix] Updated user tier to 'pro'`);

        // 4. Verify update
        const [updated] = await db.query(`SELECT subscription_tier, stripe_customer_id FROM ${dbUserId}`);

        return c.json({
            success: true,
            user: updated[0],
            payment: payment
        });

    } catch (e) {
        console.error('[Admin Fix] Error:', e);
        return c.json({ error: e.message }, 500);
    }
});

export default adminFix;
