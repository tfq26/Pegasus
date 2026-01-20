
import { db } from '../../src/db/index.js';
import { storageCredentials } from '../../src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { S3Provider } from './providers/S3Provider.js';

export class StorageManager {
    static async getProvider(userId, providerType = null) {
        // 1. Force Default
        if (providerType === 'default') {
            return this._createDefaultProvider();
        }

        // 2. Custom Provider
        try {
            // If providerType is 'custom' or unspecified, we check for enabled custom credentials
            const creds = await db.select().from(storageCredentials)
                .where(and(
                    eq(storageCredentials.userId, userId),
                    eq(storageCredentials.isEnabled, true)
                ))
                .limit(1);

            if (creds && creds.length > 0) {
                const config = creds[0].config;
                const provider = new S3Provider(config);
                provider.providerType = 'custom';
                return provider;
            }
        } catch (e) {
            console.error(`[StorageManager] Failed to load custom credentials for user ${userId}:`, e);
        }

        // 3. Fallback to Default
        return this._createDefaultProvider();
    }

    static _createDefaultProvider() {
        const defaultConfig = {
            endpoint: process.env.S3_ENDPOINT,
            region: process.env.S3_REGION || 'us-east-1',
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            bucket: process.env.S3_BUCKET_NAME
        };
        const provider = new S3Provider(defaultConfig);
        provider.providerType = 'default';
        return provider;
    }
}
