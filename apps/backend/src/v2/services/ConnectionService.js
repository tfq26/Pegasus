import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { connections } from '../../db/schema.js';
import { createAdapter } from '../../../adapters/index.js';

export class ConnectionService {
    async openConnection(userId, connectionId) {
        const rawConnectionId = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId;
        const connection = await db.query.connections.findFirst({
            where: and(eq(connections.id, rawConnectionId), eq(connections.userId, userId))
        });

        if (!connection) {
            throw new Error('Connection not found');
        }

        const provider = connection.type;
        const config = typeof connection.config === 'string' ? JSON.parse(connection.config) : connection.config;
        const adapterConfig = config?.[provider] || config;
        const adapter = await createAdapter(provider, adapterConfig, userId);

        if (!adapter) {
            throw new Error(`Provider ${provider} is not supported by v2`);
        }

        await adapter.connect();

        return {
            connection,
            provider,
            adapter,
            disconnect: async () => {
                await adapter.disconnect?.().catch(() => { });
            }
        };
    }
}
