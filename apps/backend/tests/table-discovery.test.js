import { beforeEach, describe, expect, test } from 'bun:test';
import { TableDiscoveryService } from '../src/services/TableDiscoveryService.js';
import { RAGService } from '../src/services/ragService.js';

describe('TableDiscoveryService', () => {
    beforeEach(() => {
        RAGService.hybridSearch = async () => [];
    });

    test('prefers combined tables for comparison questions', async () => {
        const schema = {
            tables: ['asia_sales_2025', 'combined_sales'],
            detailedSchema: {
                asia_sales_2025: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }],
                combined_sales: [{ name: 'date' }, { name: 'region' }, { name: 'amount' }, { name: 'units' }]
            },
            sourceRegistry: {
                asia_sales_2025: { origin: 'Asia Sales 2025' },
                combined_sales: { origin: 'Synthetic Combined Source' }
            },
            tableDescriptions: {
                combined_sales: 'Combined cross-source table for sales'
            }
        };

        const results = await TableDiscoveryService.discover(
            'Which market had the best sales overall?',
            'user-1',
            schema
        );

        expect(results[0]?.tableName).toBe('combined_sales');
        expect(results[0]?.reasons.some((reason) => reason.includes('combined cross-source'))).toBe(true);
    });
});
