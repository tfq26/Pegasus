
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
        const [result] = await this.db.query(`
            SELECT status FROM transaction_master WHERE stripe_session_id = $sid
        `, { sid: sessionId });
        return result && result[0] && result[0].status === 'completed';
    }

    /**
     * Logs the start of a transaction
     */
    async initTransaction(sessionId, type, userId, customerId, payload) {
        try {
            await this.db.query(`
                INSERT INTO transaction_master {
                    stripe_session_id: $sid,
                    status: 'pending',
                    type: $type,
                    user_id: $uid,
                    customer_id: $cid,
                    payload: $payload,
                    created_at: time::now()
                }
            `, {
                sid: sessionId,
                type,
                uid: userId,
                cid: customerId,
                payload
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
        await this.db.query(`
            UPDATE transaction_master SET status = 'completed' WHERE stripe_session_id = $sid
        `, { sid: sessionId });
    }

    /**
     * Marks transaction as failed
     */
    async failTransaction(sessionId, error) {
        await this.db.query(`
            UPDATE transaction_master SET status = 'failed', error = $err WHERE stripe_session_id = $sid
        `, { sid: sessionId, err: error });
    }

    /**
     * Grants tokens to a user
     */
    async grantTokens(userId, tokenAmount, sessionId, amountPaid, currency = 'usd') {
        const rawId = this._getRawId(userId);
        console.log(`[Entitlement] Granting ${tokenAmount} tokens to ${userId}`);

        // 1. Update User Record
        await this.db.query(`
            UPDATE type::thing('user', $rawId) SET 
                purchased_tokens = <int>(purchased_tokens OR 0) + <int>$amount,
                updated_at = time::now();
        `, { rawId, amount: tokenAmount });

        // 2. Create User Payment Log
        await this.db.query(`
            INSERT INTO user_payment {
                user: type::thing('user', $rawId),
                amount: $amount,
                currency: $cur,
                tokens: $tokens,
                storage_bytes: 0,
                status: 'completed',
                description: $desc,
                stripe_session_id: $sid,
                created_at: time::now()
            }
        `, {
            rawId,
            amount: amountPaid,
            cur: currency,
            tokens: tokenAmount,
            desc: `${(tokenAmount / 1000).toFixed(0)}k AI Token Pack`,
            sid: sessionId
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
        await this.db.query(`
            UPDATE type::thing('user', $rawId) SET 
                purchased_storage = <int>(purchased_storage OR 0) + <int>$amount,
                updated_at = time::now();
        `, { rawId, amount: storageBytes });

        // 2. Create User Payment Log
        await this.db.query(`
            INSERT INTO user_payment {
                user: type::thing('user', $rawId),
                amount: $amount,
                currency: $cur,
                tokens: 0,
                storage_bytes: $storage_bytes,
                status: 'completed',
                description: $desc,
                stripe_session_id: $sid,
                created_at: time::now()
            }
        `, {
            rawId,
            amount: amountPaid,
            cur: currency,
            storage_bytes: storageBytes,
            desc: `${gb}GB Vault Storage Expansion`,
            sid: sessionId
        });
    }

    /**
     * Updates subscription tier
     */
    async updateSubscription(email, tier, customerId, sessionId = null, amountPaid = 0, currency = 'usd') {
        console.log(`[Entitlement] Updating subscription for ${email} to ${tier}`);

        // 1. Update User Record
        // We use email here because sometimes we only have customer email from Stripe
        const [userResult] = await this.db.query(`
            UPDATE user SET 
                stripe_customer_id = $custId, 
                subscription_tier = $tier,
                updated_at = time::now()
            WHERE email = $email
            RETURN id;
        `, {
            custId: customerId,
            tier: tier,
            email: email
        });

        const userId = userResult[0]?.id;

        // 2. Log Payment if session ID is provided (Initial purchase)
        if (sessionId && userId) {
            const rawId = this._getRawId(userId);
            await this.db.query(`
                INSERT INTO user_payment {
                    user: type::thing('user', $rawId),
                    amount: $amount,
                    currency: $cur,
                    tokens: 0,
                    storage_bytes: 0,
                    status: 'completed',
                    description: $desc,
                    stripe_session_id: $sid,
                    created_at: time::now()
                }
            `, {
                rawId,
                amount: amountPaid,
                cur: currency,
                desc: `${tier === 'pro_plus' ? 'Pro+' : 'Pro'} Subscription Upgrade`,
                sid: sessionId
            });
        }
    }

    /**
     * Downgrades/Removes subscription
     */
    async removeSubscription(customerId) {
        console.log(`[Entitlement] Removing subscription for customer ${customerId}`);
        await this.db.query(`
            UPDATE user SET 
                subscription_tier = 'free',
                updated_at = time::now() 
            WHERE stripe_customer_id = $custId;
        `, { custId: customerId });
    }

    /**
    * Removes storage (subscription cancelled)
    */
    async removeStorageSubscription(customerId) {
        console.log(`[Entitlement] Removing storage subscription for customer ${customerId}`);
        await this.db.query(`
            UPDATE user SET 
                purchased_storage = 0,
                updated_at = time::now() 
            WHERE stripe_customer_id = $custId;
        `, { custId: customerId });
    }
}
