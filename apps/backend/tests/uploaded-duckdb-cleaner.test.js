import { describe, expect, test } from 'bun:test';
import { UploadedDuckDBCleaner } from '../src/services/import/UploadedDuckDBCleaner.js';

describe('UploadedDuckDBCleaner', () => {
    test('prefers alias-mapped cleaned tables when active table references raw upload name', () => {
        const preferred = UploadedDuckDBCleaner.resolvePreferredActiveTable(
            'PortfolioGainLossReport_raw',
            ['portfolio_holdings__clean'],
            {
                PortfolioGainLossReport_raw: 'portfolio_holdings__clean',
                portfoliogainlossreportraw: 'portfolio_holdings__clean'
            }
        );

        expect(preferred).toBe('portfolio_holdings__clean');
    });

    test('prefers parsed duckdb path for workbook-backed uploads', async () => {
        const original = UploadedDuckDBCleaner.getUploadFile;
        UploadedDuckDBCleaner.getUploadFile = async () => ({
            fileType: 'xlsx',
            storagePath: '/tmp/upload_abc.duckdb',
            storageId: 'uploads/user/portfolio.xlsx',
            parsedSchema: {
                duckdb_path: '/tmp/upload_abc.duckdb',
                provider: 'duckdb'
            }
        });

        const resolved = await UploadedDuckDBCleaner.resolveConnectionTarget('uploads/user/portfolio.xlsx');

        expect(resolved.preferredPath).toBe('/tmp/upload_abc.duckdb');

        UploadedDuckDBCleaner.getUploadFile = original;
    });
});
