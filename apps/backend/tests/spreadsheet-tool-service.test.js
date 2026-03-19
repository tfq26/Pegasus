import { describe, expect, test } from 'bun:test';
import { SpreadsheetToolService } from '../src/services/SpreadsheetToolService.js';

describe('SpreadsheetToolService query_data', () => {
    test('post-processes Cosmos grouped aggregates client-side instead of sending ranked aggregate SQL directly', async () => {
        const service = new SpreadsheetToolService();
        let capturedSql = null;

        const result = await service.callTool('query_data', {
            resource: 'OrionMetrics',
            filters: [{ field: 'timestamp', op: 'gte', value: '2026-03-19T05:00:00.000Z' }],
            groupBy: ['serverName'],
            aggregations: [{ op: 'max', field: 'latencyMs', alias: 'max_latencyMs' }],
            orderBy: [{ field: 'max_latencyMs', direction: 'desc' }],
            limit: 1
        }, {
            dialect: 'cosmosdb',
            schema: { mappings: { tables: {}, columns: {} } },
            adapter: {
                async query(sql) {
                    capturedSql = sql;
                    return [
                        { serverName: 'app-2', max_latencyMs: 120 },
                        { serverName: 'app-1', max_latencyMs: 350 },
                        { serverName: 'app-3', max_latencyMs: 210 }
                    ];
                }
            }
        });

        expect(capturedSql).toContain('GROUP BY "serverName"');
        expect(capturedSql).not.toContain('ORDER BY');
        expect(capturedSql).not.toContain('LIMIT 1');
        expect(result.data).toEqual([{ serverName: 'app-1', max_latencyMs: 350 }]);
    });
});
