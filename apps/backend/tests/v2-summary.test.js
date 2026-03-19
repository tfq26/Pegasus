import { describe, expect, test } from 'bun:test';
import { GroundedSummaryService } from '../src/v2/services/GroundedSummaryService.js';
import { SummaryPlanningService } from '../src/v2/services/SummaryPlanningService.js';
import { SummaryQueryBuilder } from '../src/v2/services/SummaryQueryBuilder.js';

describe('SummaryQueryBuilder', () => {
    test('builds a safe grouped summary query', () => {
        const builder = new SummaryQueryBuilder();
        const query = builder.build({
            table: 'sales',
            dimensions: ['region'],
            metrics: [{ column: 'revenue', aggregation: 'sum', alias: 'sum_revenue' }],
            filters: [{ column: 'year', operator: '=', value: 2025 }],
            orderBy: [{ column: 'sum_revenue', direction: 'desc' }],
            limit: 5
        }, {
            tables: [{
                name: 'sales',
                columns: [{ name: 'region' }, { name: 'revenue' }, { name: 'year' }]
            }]
        });

        expect(query).toContain('FROM "sales"');
        expect(query).toContain('SUM("revenue") AS "sum_revenue"');
        expect(query).toContain('"year" = 2025');
        expect(query).toContain('GROUP BY "region"');
    });
});

describe('SummaryPlanningService', () => {
    test('creates a heuristic summary plan from prompt and schema', async () => {
        const planner = new SummaryPlanningService();
        const plan = await planner.createPlan({
            prompt: 'What is the total revenue by region?',
            catalog: {
                tables: [{
                    name: 'sales',
                    columns: [{ name: 'region' }, { name: 'revenue' }, { name: 'year' }],
                    numericColumns: ['revenue']
                }]
            }
        });

        expect(plan.table).toBe('sales');
        expect(plan.dimensions).toEqual(['region']);
        expect(plan.metrics[0].aggregation).toBe('sum');
        expect(plan.metrics[0].column).toBe('revenue');
    });
});

describe('GroundedSummaryService', () => {
    test('returns an answer grounded in executed rows', async () => {
        const fakeAdapter = {
            async query() {
                return [{ region: 'West', sum_revenue: 4200 }];
            },
            async disconnect() { },
            async listCollections() {
                return ['sales'];
            },
            async getSchema() {
                return {
                    sales: [{ name: 'region', type: 'text' }, { name: 'revenue', type: 'number' }]
                };
            },
            async sampleCollection() {
                return [{ region: 'West', revenue: 1200 }];
            }
        };

        const service = new GroundedSummaryService({
            connectionService: {
                async openConnection() {
                    return {
                        adapter: fakeAdapter,
                        disconnect: async () => { }
                    };
                }
            },
            aiClient: {
                async generateContent() {
                    return { text: JSON.stringify({ answer: 'West generated 4200 in revenue.' }) };
                }
            },
            planningService: new SummaryPlanningService()
        });

        const result = await service.answer({
            userId: 'dev_user',
            connectionId: 'conn-1',
            prompt: 'Summarize total revenue by region'
        });

        expect(result.query).toContain('FROM "sales"');
        expect(result.rows[0].sum_revenue).toBe(4200);
        expect(result.text).toContain('4200');
    });
});
