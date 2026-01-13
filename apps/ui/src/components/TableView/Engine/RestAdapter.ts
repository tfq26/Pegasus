
import type { DatabaseAdapter, Operation } from './SyncManager';
import { buildConnectionPayload } from '../../../lib/db-connections';

export class RestAdapter implements DatabaseAdapter {
    private baseUrl: string;
    private tableName: string;
    private connection: any;
    private provider: string;

    constructor(
        baseUrl: string,
        tableName: string,
        connection: any,
        provider: string
    ) {
        this.baseUrl = baseUrl;
        this.tableName = tableName;
        this.connection = connection;
        this.provider = provider;
    }

    public async fetchRows(startRow: number, endRow: number): Promise<any> {
        // Note: PromiseLike<any> or specific return type matching Engine expectations
        // VirtualDataProvider expects { rows, totalCount }

        const limit = endRow - startRow;
        const offset = startRow;

        try {
            const bodyPayload = {
                tableName: this.tableName,
                connection: this.connection.provider ? buildConnectionPayload(this.connection) : this.connection,
                provider: this.provider,
                query: {
                    limit,
                    offset
                }
            };

            const response = await fetch(`${this.baseUrl}/api/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(bodyPayload)
            });

            if (!response.ok) throw new Error('Fetch failed');

            const data = await response.json();
            return {
                rows: data.rows, // Ensure format matches { __id, ...col }
                totalCount: data.totalCount
            };
        } catch (e) {
            console.error('[RestAdapter] Fetch error:', e);
            throw e;
        }
    }

    public async getMetadata() {
        // Could fetch schema
        return { totalRows: 0, columns: [] };
    }

    public async commit(operations: Operation[]): Promise<void> {
        if (operations.length === 0) return;

        const payload = {
            connection: this.connection.provider ? buildConnectionPayload(this.connection) : this.connection,
            provider: this.provider,
            operations: operations
        };

        const response = await fetch(`${this.baseUrl}/api/table/${this.tableName}/operations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const body = await response.json();
            throw new Error(body.error || 'Commit failed');
        }
    }


}
