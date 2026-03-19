import { describe, expect, test } from 'bun:test';
import { CrossSourceTableService } from '../src/services/CrossSourceTableService.js';

describe('CrossSourceTableService', () => {
    test('creates a synthetic combined table for structurally similar sources', async () => {
        const asiaAdapter = {
            async query() {
                return [{ date: '2025-01-01', region: 'Asia', amount: 10, units: 1 }];
            }
        };
        const ukAdapter = {
            async query() {
                return [{ date: '2025-01-02', region: 'UK', amount: 20, units: 2 }];
            }
        };

        const normalizedSchema = {
            tables: ['asia_sales_2025', 'uk_sales_2025'],
            detailedSchema: {
                asia_sales_2025: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }],
                uk_sales_2025: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }]
            },
            mappings: { tables: {}, columns: {} },
            sourceRegistry: {
                asia_sales_2025: { origin: 'Asia Sales', type: 'STRUCTURED' },
                uk_sales_2025: { origin: 'UK Sales', type: 'STRUCTURED' }
            },
            tableDescriptions: {}
        };
        const resourceToAdapter = {
            asia_sales_2025: asiaAdapter,
            uk_sales_2025: ukAdapter
        };
        const resourceToProvider = {
            asia_sales_2025: 'duckdb',
            uk_sales_2025: 'duckdb'
        };
        const extraAdapters = [];

        const result = await CrossSourceTableService.augmentContext({
            normalizedSchema,
            resourceToAdapter,
            resourceToProvider,
            extraAdapters
        });

        expect(result.syntheticTables).toContain('combined_sales');
        expect(result.preferredComparisons.sales).toBe('combined_sales');
        expect(normalizedSchema.tables).toContain('combined_sales');
        expect(resourceToAdapter.combined_sales).toBeTruthy();
        expect(normalizedSchema.semanticContext.preferredComparisonTables.sales).toBe('combined_sales');
        expect(normalizedSchema.semanticContext.sourceInsights.combined_sales[0].insight).toContain('Use combined_sales');
    });

    test('merges multiple sales groups into one combined table instead of replacing earlier rows', async () => {
        const internationalAdapter = {
            async query(sql) {
                if (sql.includes('asia_sales_2025')) {
                    return [{ date: '2025-01-01', region: 'Asia', amount: 10, units: 1 }];
                }
                return [{ date: '2025-01-03', region: 'UK', amount: 15, units: 1 }];
            }
        };
        const usAdapter = {
            async query() {
                return [{ date: '2025-01-02', amount: 20, units: 2, item: 'Hat' }];
            }
        };

        const normalizedSchema = {
            tables: ['asia_sales_2025', 'uk_sales_2025', 'sales_west', 'sales_east'],
            detailedSchema: {
                asia_sales_2025: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }],
                uk_sales_2025: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }],
                sales_west: [{ name: 'date' }, { name: 'item' }, { name: 'amount' }, { name: 'units' }],
                sales_east: [{ name: 'date' }, { name: 'item' }, { name: 'amount' }, { name: 'units' }]
            },
            mappings: { tables: {}, columns: {} },
            sourceRegistry: {
                asia_sales_2025: { origin: 'Asia Sales', type: 'STRUCTURED' },
                uk_sales_2025: { origin: 'UK Sales', type: 'STRUCTURED' },
                sales_west: { origin: 'US Sales', type: 'STRUCTURED' },
                sales_east: { origin: 'US Sales', type: 'STRUCTURED' }
            },
            tableDescriptions: {},
            semanticContext: { knowledgeBase: [], sourceInsights: {} }
        };
        const resourceToAdapter = {
            asia_sales_2025: internationalAdapter,
            uk_sales_2025: internationalAdapter,
            sales_west: usAdapter,
            sales_east: usAdapter
        };
        const resourceToProvider = {
            asia_sales_2025: 'duckdb',
            uk_sales_2025: 'duckdb',
            sales_west: 'sqlite',
            sales_east: 'sqlite'
        };
        const extraAdapters = [];

        await CrossSourceTableService.augmentContext({
            normalizedSchema,
            resourceToAdapter,
            resourceToProvider,
            extraAdapters
        });

        const combinedAdapter = resourceToAdapter.combined_sales;
        const rows = await combinedAdapter.query('SELECT region, source_table, amount FROM "combined_sales" ORDER BY amount ASC');

        expect(rows).toHaveLength(4);
        expect(rows.some((row) => row.region === 'Asia')).toBe(true);
        expect(rows.some((row) => row.region === 'UK')).toBe(true);
        expect(rows.some((row) => row.region === 'West')).toBe(true);
        expect(rows.some((row) => row.region === 'East')).toBe(true);
    });
});
