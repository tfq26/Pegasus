import { describe, test, expect } from 'bun:test';
import { DataNormalizer } from '../DataNormalizer';

describe('DataNormalizer', () => {
    describe('detectHeaders', () => {
        test('detects headers when first row is strings and second row has mixed types', () => {
            const data = [
                { col1: 'Name', col2: 'Age', col3: 'City' },
                { col1: 'John', col2: 25, col3: 'NYC' },
                { col1: 'Jane', col2: 30, col3: 'LA' }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(true);
        });

        test('does not detect headers when first row has numbers', () => {
            const data = [
                { col1: 100, col2: 200, col3: 300 },
                { col1: 101, col2: 201, col3: 301 }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(false);
        });

        test('detects headers when values look like column names', () => {
            const data = [
                { col1: 'Product_Name', col2: 'Price', col3: 'Stock_Count' },
                { col1: 'Widget', col2: 'Premium', col3: 'Available' }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(true);
        });

        test('does not detect headers when first row has very long strings', () => {
            const data = [
                { col1: 'This is a very long description that is definitely data not a header', col2: 'Another long text' },
                { col1: 'More long text here', col2: 'And here' }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(false);
        });

        test('does not detect headers when first row has many special characters', () => {
            const data = [
                { col1: 'test@#$%^&*()', col2: '!!!???###' },
                { col1: 'normal text', col2: 'more text' }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(false);
        });

        test('returns false for empty data', () => {
            expect(DataNormalizer.detectHeaders([])).toBe(false);
        });

        test('returns false for single row', () => {
            const data = [{ col1: 'Name', col2: 'Age' }];
            expect(DataNormalizer.detectHeaders(data)).toBe(false);
        });

        test('detects headers when all rows are strings but first row looks like headers', () => {
            const data = [
                { col1: 'Name', col2: 'Category', col3: 'Status' },
                { col1: 'John Smith with a longer name', col2: 'Some category description', col3: 'Active status' }
            ];

            expect(DataNormalizer.detectHeaders(data)).toBe(true);
        });
    });

    describe('colIndexToLetter', () => {
        test('converts single digit indices correctly', () => {
            expect(DataNormalizer.colIndexToLetter(0)).toBe('A');
            expect(DataNormalizer.colIndexToLetter(25)).toBe('Z');
        });

        test('converts double digit indices correctly', () => {
            expect(DataNormalizer.colIndexToLetter(26)).toBe('AA');
            expect(DataNormalizer.colIndexToLetter(27)).toBe('AB');
            expect(DataNormalizer.colIndexToLetter(51)).toBe('AZ');
            expect(DataNormalizer.colIndexToLetter(52)).toBe('BA');
        });
    });

    describe('normalize', () => {
        test('normalizes data with detected headers', () => {
            const data = [
                { col1: 'Name', col2: 'Age', col3: 'City' },
                { col1: 'John', col2: 25, col3: 'NYC' },
                { col1: 'Jane', col2: 30, col3: 'LA' }
            ];

            const result = DataNormalizer.normalize(data, 'surrealdb', 'test_table');

            expect(result.schemaMode).toBe('named-headers');
            expect(result.metadata.hasHeaders).toBe(true);
            expect(result.columns).toHaveLength(3);
            expect(result.columns[0].name).toBe('Name');
            expect(result.columns[1].name).toBe('Age');
            expect(result.columns[2].name).toBe('City');
            expect(result.rows).toHaveLength(2); // First row removed (headers)
            expect(result.metadata.originalHeaders).toEqual(['Name', 'Age', 'City']);
        });

        test('normalizes data without headers using column letters', () => {
            const data = [
                { col1: 100, col2: 200, col3: 300 },
                { col1: 101, col2: 201, col3: 301 }
            ];

            const result = DataNormalizer.normalize(data, 'surrealdb', 'test_table');

            expect(result.schemaMode).toBe('column-letters');
            expect(result.metadata.hasHeaders).toBe(false);
            expect(result.columns).toHaveLength(3);
            expect(result.columns[0].name).toBe('A');
            expect(result.columns[1].name).toBe('B');
            expect(result.columns[2].name).toBe('C');
            expect(result.rows).toHaveLength(2); // All rows are data
        });

        test('handles empty data', () => {
            const result = DataNormalizer.normalize([], 'surrealdb', 'test_table');

            expect(result.rows).toHaveLength(0);
            expect(result.columns).toHaveLength(0);
            expect(result.schemaMode).toBe('column-letters');
        });
    });

    describe('denormalize', () => {
        test('includes headers when denormalizing named-headers data', () => {
            const normalized = {
                rows: [
                    { Name: 'John', Age: 25 },
                    { Name: 'Jane', Age: 30 }
                ],
                columns: [
                    { name: 'Name', displayName: 'Name', index: 0 },
                    { name: 'Age', displayName: 'Age', index: 1 }
                ],
                schemaMode: 'named-headers' as const,
                metadata: {
                    source: 'test',
                    provider: 'surrealdb',
                    hasHeaders: true,
                    originalHeaders: ['Name', 'Age']
                }
            };

            const result = DataNormalizer.denormalize(normalized);

            expect(result).toHaveLength(3); // Headers + 2 data rows
            expect(result[0]).toEqual({ Name: 'Name', Age: 'Age' }); // Header row
        });

        test('excludes headers when denormalizing column-letters data', () => {
            const normalized = {
                rows: [
                    { A: 100, B: 200 },
                    { A: 101, B: 201 }
                ],
                columns: [
                    { name: 'A', displayName: 'A', index: 0 },
                    { name: 'B', displayName: 'B', index: 1 }
                ],
                schemaMode: 'column-letters' as const,
                metadata: {
                    source: 'test',
                    provider: 'surrealdb',
                    hasHeaders: false
                }
            };

            const result = DataNormalizer.denormalize(normalized);

            expect(result).toHaveLength(2); // Just data rows
        });
    });

    describe('remapColumns', () => {
        test('remaps columns correctly', () => {
            const data = [
                { A: 'John', B: 25, C: 'NYC' },
                { A: 'Jane', B: 30, C: 'LA' }
            ];

            const result = DataNormalizer.remapColumns(
                data,
                ['A', 'B', 'C'],
                ['Name', 'Age', 'City']
            );

            expect(result[0]).toEqual({ Name: 'John', Age: 25, City: 'NYC' });
            expect(result[1]).toEqual({ Name: 'Jane', Age: 30, City: 'LA' });
        });

        test('throws error on column count mismatch', () => {
            const data = [{ A: 1, B: 2 }];

            expect(() => {
                DataNormalizer.remapColumns(data, ['A', 'B'], ['X', 'Y', 'Z']);
            }).toThrow('Column count mismatch');
        });
    });
});
