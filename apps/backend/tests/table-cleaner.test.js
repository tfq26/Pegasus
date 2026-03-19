import { describe, expect, test } from 'bun:test';
import { TableCleanerService } from '../src/services/import/TableCleanerService.js';

describe('TableCleanerService', () => {
    test('chooses structured report strategy for mangled report-like rows', () => {
        const cleaner = new TableCleanerService();
        const rows = [
            { Name: 'Sales Report', Amount: '', Units: '' },
            { Name: 'North Region', Amount: '', Units: '' },
            { Name: 'Alpha Fund', Amount: '100', Units: '10' },
            { Name: 'Beta Fund', Amount: '200', Units: '20' },
            { Name: 'Total', Amount: '300', Units: '30' },
            { Name: 'South Region', Amount: '', Units: '' },
            { Name: 'Gamma Fund', Amount: '400', Units: '40' }
        ];

        const result = cleaner.cleanDataset({ tableName: 'report', rows, sourceType: 'xlsx' });
        expect(result.metadata.strategy).toBe('structured_report');
        expect(result.tables[0].rows.length).toBe(3);
        expect(result.tables[0].rows[0].context_label_1).toBe('Sales Report');
        expect(result.tables[0].rows[0].context_label_2).toBe('North Region');
        expect(result.tables[0].rows[2].context_label_2).toBe('South Region');
    });

    test('keeps flat tables mostly intact while removing repeated headers', () => {
        const cleaner = new TableCleanerService();
        const rows = [
            { Name: 'Alice', Revenue: '10' },
            { Name: 'Name', Revenue: 'Revenue' },
            { Name: 'Bob', Revenue: '20' }
        ];

        const result = cleaner.cleanDataset({ tableName: 'flat', rows, sourceType: 'csv' });
        expect(result.tables[0].rows.length).toBe(2);
        expect(result.tables[0].rows[0].Name).toBe('Alice');
        expect(result.tables[0].rows[1].Name).toBe('Bob');
    });
});
