#!/usr/bin/env node

/**
 * Migration Script: SurrealDB → Neon PostgreSQL
 * Migrates user_payment records from SurrealDB to Neon
 */

import { Surreal } from 'surrealdb';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { userPayments } from './src/db/schema.js';
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
