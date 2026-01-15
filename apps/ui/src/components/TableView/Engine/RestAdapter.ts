
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

            const response = await fetch(`${this.baseUrl}/api/table/${this.tableName}/query`, {
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

    public async save(data: any[]): Promise<void> {
        // "Save" here means saving a version to the user's storage
        // We use the existing operations endpoint but with a special 'full_replacement' op
        // tailored for user-storage tables.

        const payload = {
            connection: this.connection.provider ? buildConnectionPayload(this.connection) : this.connection,
            provider: 'surrealdb', // Always save to Pegasus internal DB (Surreal)
            operations: [{
                type: 'full_replacement',
                rows: data,
                timestamp: Date.now()
            }]
        };

        const response = await fetch(`${this.baseUrl}/api/table/${this.tableName}/operations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const body = await response.json();
            throw new Error(body.error || 'Save failed');
        }
    }


}
