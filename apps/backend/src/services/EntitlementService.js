import { eq, and, sql } from "drizzle-orm";
import { transactionMaster, userPayments, users } from "../db/schema.js";

// EntitlementService.js
// Handles all logic for updating user limits and logging transactions
// Ensures idempotency and atomicity where possible

export class EntitlementService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Helper to get raw ID from a potentially namespaced ID string
     */
    _getRawId(userId) {
        if (!userId) return null;
        return userId.includes(':') ? userId.split(':')[1] : userId;
    }

    /**
     * Checks if a transaction has already been processed
     * @param {string} sessionId - Stripe Session ID
     * @returns {Promise<boolean>}
     */
    async isTransactionProcessed(sessionId) {
        const result = await this.db.query.transactionMaster.findFirst({
            where: eq(transactionMaster.stripeSessionId, sessionId)
        });
        return result && result.status === 'completed';
    }

    /**
     * Logs the start of a transaction
     */
    async initTransaction(sessionId, type, userId, customerId, payload) {
        try {
            await this.db.insert(transactionMaster).values({
                stripeSessionId: sessionId,
                status: 'pending',
                type,
                userId: this._getRawId(userId),
                customerId,
                payload,
                createdAt: new Date()
            });
        } catch (e) {
            // Ignore if already exists (idempotency check might have flagged it, but safety first)
            console.log(`[Entitlement] Transaction log already exists for ${sessionId}`);
        }
    }

    /**
     * Marks transaction as completed
     */
    async completeTransaction(sessionId) {
        await this.db.update(transactionMaster)
            .set({ status: 'completed' })
            .where(eq(transactionMaster.stripeSessionId, sessionId));
    }

    /**
     * Marks transaction as failed
     */
    async failTransaction(sessionId, error) {
        await this.db.update(transactionMaster)
            .set({ status: 'failed', error })
            .where(eq(transactionMaster.stripeSessionId, sessionId));
    }

    /**
     * Grants tokens to a user
     */
    async grantTokens(userId, tokenAmount, sessionId, amountPaid, currency = 'usd') {
        const rawId = this._getRawId(userId);
        console.log(`[Entitlement] Granting ${tokenAmount} tokens to ${userId}`);

        // 1. Update User Record
        await this.db.update(users)
            .set({
                purchasedTokens: sql`${users.purchasedTokens} + ${tokenAmount}`,
                updatedAt: new Date()
            })
            .where(eq(users.id, rawId));

        // 2. Create User Payment Log
        await this.db.insert(userPayments).values({
            userId: rawId,
            amount: amountPaid,
            currency,
            tokens: tokenAmount,
            storageBytes: 0,
            status: 'completed',
            stripePaymentIntentId: sessionId, // Using sessionId as a reference if that's what's available
            createdAt: new Date()
        });
    }

    /**
     * Grants storage to a user
     */
    async grantStorage(userId, storageBytes, sessionId, amountPaid, currency = 'usd') {
        const rawId = this._getRawId(userId);
        const gb = (storageBytes / (1024 * 1024 * 1024)).toFixed(0);
        console.log(`[Entitlement] Granting ${gb}GB storage to ${userId}`);

        // 1. Update User Record
        await this.db.update(users)
            .set({
                purchasedStorage: sql`${users.purchasedStorage} + ${storageBytes}`,
                updatedAt: new Date()
            })
            .where(eq(users.id, rawId));

        // 2. Create User Payment Log
        await this.db.insert(userPayments).values({
            userId: rawId,
            amount: amountPaid,
            currency,
            tokens: 0,
            storageBytes: storageBytes,
            status: 'completed',
            stripePaymentIntentId: sessionId,
            createdAt: new Date()
        });
    }

    /**
     * Updates subscription tier
     */
    async updateSubscription(email, tier, customerId, sessionId = null, amountPaid = 0, currency = 'usd') {
        console.log(`[Entitlement] Updating subscription for ${email} to ${tier}`);

        // 1. Update User Record
        const [updatedUser] = await this.db.update(users)
            .set({
                stripeCustomerId: customerId,
                subscriptionTier: tier,
                updatedAt: new Date()
            })
            .where(eq(users.email, email))
            .returning();

        const userId = updatedUser?.id;

        // 2. Log Payment if session ID is provided (Initial purchase)
        if (sessionId && userId) {
            await this.db.insert(userPayments).values({
                userId,
                amount: amountPaid,
                currency,
                tokens: 0,
                storageBytes: 0,
                status: 'completed',
                stripePaymentIntentId: sessionId,
                createdAt: new Date()
            });
        }
    }

    /**
     * Downgrades/Removes subscription
     */
    async removeSubscription(customerId) {
        console.log(`[Entitlement] Removing subscription for customer ${customerId}`);
        await this.db.update(users)
            .set({
                subscriptionTier: 'free',
                updatedAt: new Date()
            })
            .where(eq(users.stripeCustomerId, customerId));
    }

    /**
    * Removes storage (subscription cancelled)
    */
    async removeStorageSubscription(customerId) {
        console.log(`[Entitlement] Removing storage subscription for customer ${customerId}`);
        await this.db.update(users)
            .set({
                purchasedStorage: 0,
                updatedAt: new Date()
            })
            .where(eq(users.stripeCustomerId, customerId));
    }

    /**
     * Checks if a user has access to a specific feature
     */
    async hasFeature(userId, featureName) {
        if (!userId) return false;
        const tier = await this.getTier(userId);

        const FEATURES = {
            'free': [],
            'pro': ['advanced_charts', 'priority_support'],
            'pro_plus': ['advanced_charts', 'priority_support', 'extended_context'],
            'teams': ['advanced_charts', 'priority_support', 'extended_context', 'byom_models', 'team_sharing'],
            'enterprise': ['advanced_charts', 'priority_support', 'extended_context', 'byom_models', 'team_sharing', 'sso', 'audit_logs']
        };

        const allowedFeatures = FEATURES[tier] || [];
        return allowedFeatures.includes(featureName);
    }

    /**
     * Helper to get user's subscription tier
     */
    async getTier(userId) {
        if (!userId) return 'free';
        const rawId = this._getRawId(userId);

        const user = await this.db.query.users.findFirst({
            where: eq(users.id, rawId),
            columns: { subscriptionTier: true }
        });

        return user?.subscriptionTier || 'free';
    }

    /**
     * Manually sets a user's tier (For Enterprise/Sales-led deals)
     */
    async manuallyGrantTier(email, tier) {
        console.log(`[Entitlement] Manually granting ${tier} to ${email}`);
        await this.db.update(users)
            .set({
                subscriptionTier: tier,
                updatedAt: new Date()
            })
            .where(eq(users.email, email));
    }
}
