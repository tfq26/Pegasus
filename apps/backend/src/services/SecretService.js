import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/index.js';
import { userSecrets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

// Get the directory of this file and resolve .env relative to the backend root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });
console.log('[SecretService] Loaded .env from:', envPath);

/**
 * SecretService
 * Uses Neon/Postgres via Drizzle for persistent, secure storage of secrets.
 */
export class SecretService {
    constructor() {
        this.devEncryptionKey = process.env.PEGASUS_DEV_SECRET_KEY || 'dev-secret-key-32-chars-must-be-long!';
        console.log('[SecretService] Unified Service Initialized (Postgres + Encryption)');
    }

    // --- Core Instance Methods ---

    async resolveSecret(reference) {
        if (!reference || typeof reference !== 'string') return reference;
        if (reference.startsWith('vault://')) {
            const keyPath = reference.replace('vault://', '');
            return this.getSecret(keyPath);
        }
        return reference;
    }

    async storeSecret(key, value, userId) {
        return SecretService.storeSecret(userId, key, value);
    }

    async getSecret(key, userId) {
        return SecretService.getSecret(userId, key);
    }

    async deleteSecret(key, userId) {
        return SecretService.deleteSecret(userId, key);
    }

    // --- Static Methods ---

    static async storeSecret(userId, name, value) {
        const idPart = this._getUserIdPart(userId || this._extractUserId(name));
        const encrypted = this._encrypt(value);

        try {
            await db.insert(userSecrets).values({
                userId: idPart,
                name,
                value: encrypted,
                updatedAt: new Date()
            }).onConflictDoUpdate({
                target: [userSecrets.userId, userSecrets.name],
                set: { value: encrypted, updatedAt: new Date() }
            });

            return `vault://${name}`;
        } catch (e) {
            console.error('[SecretService] Failed to store secret:', e);
            throw e;
        }
    }

    static async getSecret(userId, name) {
        const idPart = this._getUserIdPart(userId || this._extractUserId(name));
        try {
            const record = await db.query.userSecrets.findFirst({
                where: and(eq(userSecrets.userId, idPart), eq(userSecrets.name, name))
            });

            if (!record) return null;
            return this._decrypt(record.value);
        } catch (e) {
            console.error('[SecretService] Failed to get secret:', e);
            return null;
        }
    }

    static async deleteSecret(userId, name) {
        const idPart = this._getUserIdPart(userId || this._extractUserId(name));
        try {
            await db.delete(userSecrets)
                .where(and(eq(userSecrets.userId, idPart), eq(userSecrets.name, name)));
            return true;
        } catch (e) {
            console.error('[SecretService] Failed to delete secret:', e);
            return false;
        }
    }

    static maskConfig(config, isOwner = false) {
        if (!config) return config;
        const sensitiveKeys = ['apiKey', 'api_key', 'token', 'password', 'secret', 'connectionString'];
        const masked = { ...config };
        for (const key of sensitiveKeys) {
            if (key in masked) {
                if (!isOwner) masked[key] = '********';
            }
        }
        return masked;
    }

    // --- Private Helper Methods ---

    static _getUserIdPart(userId) {
        if (!userId) return 'system';
        const id = userId.toString();
        return id.startsWith('user:') ? id.split(':')[1] : id;
    }

    static _extractUserId(key) {
        if (!key || typeof key !== 'string') return 'system';
        const segments = key.split('/');
        const userIndex = segments.indexOf('users');
        if (userIndex !== -1 && segments[userIndex + 1]) {
            return segments[userIndex + 1];
        }
        return 'system';
    }

    static _encrypt(text) {
        const keyString = process.env.PEGASUS_DEV_SECRET_KEY || 'dev-secret-key-32-chars-must-be-long!';
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(keyString, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    static _decrypt(text) {
        try {
            if (!text || typeof text !== 'string') return text;
            if (!text.includes(':')) return text;

            const keyString = process.env.PEGASUS_DEV_SECRET_KEY || 'dev-secret-key-32-chars-must-be-long!';
            const textParts = text.split(':');
            if (textParts.length < 2) return text;

            const iv = Buffer.from(textParts.shift(), 'hex');
            const encryptedText = Buffer.from(textParts.join(':'), 'hex');
            const key = crypto.scryptSync(keyString, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (e) {
            console.error('[SecretService] Decryption failed:', e);
            return text;
        }
    }
}

export const secretService = new SecretService();
