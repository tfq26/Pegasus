#!/usr/bin/env node

/**
 * Migration Script: SurrealDB → Neon PostgreSQL
 * Migrates user_payment records from SurrealDB to Neon
 */

import { Surreal } from 'surrealdb';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { userPayments, experimentalAccess, experimentalRequests, userFeatureFlags } from './src/db/schema.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const SURREAL_URL = process.env.SURREAL_URL;
const SURREAL_USER = process.env.SURREAL_USER;
const SURREAL_PASS = process.env.SURREAL_PASS;
const SURREAL_NS = process.env.SURREAL_NS;
const SURREAL_DB = process.env.SURREAL_DB;
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

async function migrateSurrealToNeon() {
    console.log('🚀 Starting SurrealDB → Neon migration...\n');

    // Connect to SurrealDB
    console.log('📡 Connecting to SurrealDB...');
    console.log(`   URL: ${SURREAL_URL}`);
    console.log(`   Namespace: ${SURREAL_NS}`);
    console.log(`   Database: ${SURREAL_DB}\n`);

    const surrealDb = new Surreal();

    try {
        // Connect using the WebSocket URL directly
        await surrealDb.connect(SURREAL_URL, {
            namespace: SURREAL_NS,
            database: SURREAL_DB,
            auth: {
                username: SURREAL_USER,
                password: SURREAL_PASS,
            }
        });
        console.log('✅ Connected to SurrealDB\n');
    } catch (error) {
        console.error('❌ Failed to connect to SurrealDB:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }

    // Connect to Neon
    console.log('📡 Connecting to Neon PostgreSQL...');
    const sql = neon(DATABASE_URL);
    const db = drizzle(sql);
    console.log('✅ Connected to Neon\n');

    try {
        // Fetch all payments from SurrealDB
        console.log('📥 Fetching payments from SurrealDB...');
        const surrealPayments = await surrealDb.query('SELECT * FROM user_payment');

        console.log('Raw response:', JSON.stringify(surrealPayments, null, 2));

        if (!surrealPayments || surrealPayments.length === 0) {
            console.log('⚠️  No payments found in SurrealDB');
            await surrealDb.close();
            return;
        }

        // SurrealDB v1.x returns results differently
        const payments = surrealPayments[0]?.result || surrealPayments[0] || [];

        if (payments.length === 0) {
            console.log('⚠️  No payment records found');
            await surrealDb.close();
            return;
        }

        console.log(`✅ Found ${payments.length} payment records\n`);

        // Migrate each payment
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const payment of payments) {
            try {
                console.log(`\n📝 Processing payment:`, JSON.stringify(payment, null, 2));

                // Extract user ID from SurrealDB record ID format (user:user_xxx)
                let userId = payment.user;
                console.log('Raw user field:', userId);

                if (typeof userId === 'string') {
                    // Format: "user:user_01K8FGQG2NSJZJ7K38QFBS8CJD"
                    // We want: "user_01K8FGQG2NSJZJ7K38QFBS8CJD"
                    if (userId.includes(':')) {
                        const parts = userId.split(':');
                        userId = parts.length > 1 ? parts[1] : userId;
                    }
                } else if (typeof userId === 'object' && userId.id) {
                    // Handle record link format
                    userId = userId.id.includes(':') ? userId.id.split(':')[1] : userId.id;
                }

                console.log('Extracted userId:', userId);

                // Check if payment already exists in Neon (skip duplicate check for now, just insert)
                const { eq } = await import('drizzle-orm');

                const existingPayments = await db.select()
                    .from(userPayments)
                    .where(eq(userPayments.stripeSessionId, payment.stripe_session_id))
                    .limit(1);

                if (existingPayments && existingPayments.length > 0) {
                    console.log(`⏭️  Skipping duplicate: ${payment.stripe_session_id}`);
                    skipCount++;
                    continue;
                }

                // Map SurrealDB fields to Neon schema
                const neonPayment = {
                    userId: userId,
                    amount: payment.amount || 0,
                    currency: payment.currency || 'usd',
                    tokens: payment.tokens || 0,
                    storageBytes: payment.storage_bytes || 0,
                    description: payment.description || '',
                    status: payment.status || 'completed',
                    stripePaymentIntentId: payment.stripe_payment_intent_id || null,
                    stripeSessionId: payment.stripe_session_id || null,
                    createdAt: payment.created_at ? new Date(payment.created_at) : new Date(),
                };

                console.log(`💾 Inserting into Neon:`, neonPayment);

                // Insert into Neon
                await db.insert(userPayments).values(neonPayment);

                console.log(`✅ Migrated: ${payment.description} ($${(payment.amount / 100).toFixed(2)})`);
                successCount++;

            } catch (error) {
                console.error(`❌ Failed to migrate payment ${payment.id}:`, error.message);
                console.error('Full error:', error);
                errorCount++;
            }
        }

        // --- Migrate Experimental Access ---
        console.log('\n📥 Fetching experimental_access from SurrealDB...');
        const surrealAccess = await surrealDb.query('SELECT * FROM experimental_access');
        const accessList = surrealAccess[0]?.result || surrealAccess[0] || [];

        console.log(`✅ Found ${accessList.length} experimental access records`);

        for (const data of accessList) {
            try {
                let userId = data.user_id || data.user;
                if (typeof userId === 'string' && userId.includes(':')) userId = userId.split(':')[1];

                await db.insert(experimentalAccess).values({
                    userId,
                    hasAccess: !!data.has_access,
                    grantedAt: data.granted_at ? new Date(data.granted_at) : new Date(),
                    grantedBy: data.granted_by
                }).onConflictDoNothing();
                console.log(`✅ Migrated access for user: ${userId}`);
            } catch (e) { console.error('Failed access migration', e.message) }
        }

        // --- Migrate Feature Flags ---
        console.log('\n📥 Fetching user_feature_flag from SurrealDB...');
        const surrealFlags = await surrealDb.query('SELECT * FROM user_feature_flag');
        const flagList = surrealFlags[0]?.result || surrealFlags[0] || [];

        console.log(`✅ Found ${flagList.length} feature flags`);

        for (const data of flagList) {
            try {
                let userId = data.user_id || data.user;
                if (typeof userId === 'string' && userId.includes(':')) userId = userId.split(':')[1];

                await db.insert(userFeatureFlags).values({
                    userId,
                    featureId: data.feature_id,
                    enabled: !!data.enabled,
                    enabledAt: data.enabled_at ? new Date(data.enabled_at) : new Date()
                }).onConflictDoNothing();
                console.log(`✅ Migrated flag ${data.feature_id} for user: ${userId}`);
            } catch (e) { console.error('Failed flag migration', e.message) }
        }


        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Migration Summary:');
        console.log('='.repeat(50));
        console.log(`✅ Successfully migrated: ${successCount}`);
        console.log(`⏭️  Skipped (duplicates):  ${skipCount}`);
        console.log(`❌ Errors:               ${errorCount}`);
        console.log(`📦 Total processed:      ${payments.length}`);
        console.log('='.repeat(50));

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('Full error:', error);
        throw error;
    } finally {
        await surrealDb.close();
        console.log('\n🔌 Disconnected from SurrealDB');
    }
}

// Run migration
migrateSurrealToNeon()
    .then(() => {
        console.log('\n🎉 Migration completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
