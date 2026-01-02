import { db } from "../../db/surreal.js";

export class SecretService {
    /**
     * Store a secret for a user
     */
    static async storeSecret(userId, name, value) {
        try {
            const userRecId = userId.includes(':') ? userId : `user:${userId}`;

            // Upsert the secret
            const [result] = await db.query(`
                LET $existing = (SELECT id FROM user_secret WHERE user = $user AND name = $name);
                IF count($existing) > 0 THEN
                    UPDATE (SELECT id FROM user_secret WHERE user = $user AND name = $name) SET value = $value;
                ELSE
                    CREATE user_secret CONTENT {
                        user: $user,
                        name: $name,
                        value: $value,
                        created_at: time::now()
                    };
                END;
            `, {
                user: userRecId,
                name: name,
                value: value
            });

            return true;
        } catch (e) {
            console.error('[SecretService] Failed to store secret:', e);
            throw e;
        }
    }

    /**
     * Get a secret for a user
     */
    static async getSecret(userId, name) {
        try {
            const userRecId = userId.includes(':') ? userId : `user:${userId}`;
            const [results] = await db.query(`
                SELECT value FROM user_secret WHERE user = $user AND name = $name
            `, {
                user: userRecId,
                name: name
            });

            if (results && results[0]) {
                return results[0].value;
            }
            return null;
        } catch (e) {
            console.error('[SecretService] Failed to get secret:', e);
            return null;
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
                if (isOwner) {
                    // Even for owners, we might want to mask it to "********" 
                    // and only show it they explicitly request to edit it.
                    // But for now, let's just leave it if they are the owner.
                } else {
                    masked[key] = '********';
                }
            }
        }

        return masked;
    }
}
