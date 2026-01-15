import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from "../../db/surreal.js";

// Get the directory of this file and resolve .env relative to the backend root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
console.log('[SecretService] Loaded .env from:', envPath);

/**
 * SecretService
 * Uses SurrealDB for persistent, secure storage of secrets.
 * This unified service handles both static calls (userId, name, value) 
 * and instance calls (key, value, userId) while providing encryption.
 */
export class SecretService {
    constructor() {
        this.devEncryptionKey = process.env.PEGASUS_DEV_SECRET_KEY || 'dev-secret-key-32-chars-must-be-long!';
        console.log('[SecretService] Unified Service Initialized (SurrealDB + Encryption)');
    }

    // --- Core Instance Methods (Matches the interface used by Cloud routes) ---

    async resolveSecret(reference) {
        if (!reference || typeof reference !== 'string') return reference;
        if (reference.startsWith('vault://')) {
            const keyPath = reference.replace('vault://', '');
            return this.getSecret(keyPath);
        }
        return reference;
    }

    async storeSecret(key, value, userId) {
        // Handle cloud route style or static-style mismatch
        return SecretService.storeSecret(userId, key, value);
    }

    async getSecret(key, userId) {
        return SecretService.getSecret(userId, key);
    }

    async deleteSecret(key, userId) {
        return SecretService.deleteSecret(userId, key);
    }

    // --- Static Methods (Matches the interface used by Weather/Dashboard routes) ---

    static async storeSecret(userId, name, value) {
        const idPart = this._getUserIdPart(userId || this._extractUserId(name));
        const encrypted = this._encrypt(value);

        try {
            // Use CREATE/UPDATE pattern for better SurrealDB Cloud compatibility
            const result = await db.query(`
                LET $userRecord = type::thing('user', $idPart);
                LET $existing = (SELECT id FROM user_secret WHERE user = $userRecord AND name = $name LIMIT 1);
                IF count($existing) > 0 THEN
                    UPDATE user_secret SET value = $value, updated_at = time::now() WHERE user = $userRecord AND name = $name;
                ELSE
                    CREATE user_secret CONTENT {
                        user: $userRecord,
                        name: $name,
                        value: $value,
                        created_at: time::now(),
                        updated_at: time::now()
                    };
                END;
            `, {
                idPart,
                name: name,
                value: encrypted
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
            const [results] = await db.query(`
                SELECT * FROM user_secret 
                WHERE user = type::thing('user', $idPart) 
                AND name = $name 
                LIMIT 1
            `, {
                idPart,
                name: name
            });

            const record = results && results[0];
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
            await db.query(`
                DELETE FROM user_secret 
                WHERE user = type::thing('user', $idPart) 
                AND name = $name
            `, {
                idPart,
                name: name
            });
            return true;
        } catch (e) {
            console.error('[SecretService] Failed to delete secret:', e);
            return false;
        }
    }

    /**
     * Mask sensitive config before sending to client
     */
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

            // If it doesn't look like our ciphertext format (iv:hex), return as is (legacy support)
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
            return text; // Fallback to raw text for legacy
        }
    }
}

export const secretService = new SecretService();
