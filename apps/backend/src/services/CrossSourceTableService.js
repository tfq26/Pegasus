import { DuckDBAdapter } from '../../adapters/duckdbAdapter.js';
import { StructuredDuckDBImportService } from './import/StructuredDuckDBImportService.js';

const IGNORE_TOKENS = new Set([
    'data', 'table', 'report', 'sheet', 'clean', 'combined', 'all',
    '2024', '2025', '2026'
]);

function slug(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function commonSemanticToken(tableNames) {
    const tokenSets = tableNames.map((name) => new Set(tokenize(name).filter((token) => !IGNORE_TOKENS.has(token) && isNaN(Number(token)))));
    const counts = new Map();
    tokenSets.forEach((set) => {
        for (const token of set) {
            counts.set(token, (counts.get(token) || 0) + 1);
        }
    });
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
}

function schemaSignature(columns) {
    return [...columns].sort().join('|');
}

function inferRegionFromTableName(tableName, dominantToken) {
    const parts = tokenize(tableName).filter((part) => part !== dominantToken && !IGNORE_TOKENS.has(part) && isNaN(Number(part)));
    if (parts.length === 0) return null;
    return parts.map((part) => part.toUpperCase() === 'UK' || part.toUpperCase() === 'US'
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export class CrossSourceTableService {
    static async augmentContext({ normalizedSchema, resourceToAdapter, resourceToProvider, extraAdapters }) {
        const candidateGroups = new Map();

        for (const tableName of normalizedSchema.tables) {
            const schema = normalizedSchema.detailedSchema[tableName];
            const source = normalizedSchema.sourceRegistry?.[tableName];
            if (!Array.isArray(schema) || schema.length < 3) continue;
            if (!source || source.type === 'UNSTRUCTURED') continue;

            const columns = schema.map((column) => column.name).filter(Boolean);
            const signature = schemaSignature(columns);
            if (!candidateGroups.has(signature)) candidateGroups.set(signature, []);
            candidateGroups.get(signature).push({ tableName, columns, source });
        }

        const syntheticTables = [];
        const preferredComparisons = {};
        const groupedRowsByToken = new Map();
        let syntheticAdapter = null;

        for (const group of candidateGroups.values()) {
            if (group.length < 2) continue;

            const dominantToken = commonSemanticToken(group.map((entry) => entry.tableName));
            if (!dominantToken) continue;

            const combinedRows = groupedRowsByToken.get(dominantToken) || [];
            for (const entry of group) {
                const adapter = resourceToAdapter[entry.tableName];
                if (!adapter) continue;

                const realTable = normalizedSchema.mappings?.tables?.[entry.tableName] || entry.tableName;
                const rows = await adapter.query(`SELECT * FROM "${realTable}" LIMIT 5000`).catch(() => []);
                if (!Array.isArray(rows) || rows.length === 0) continue;

                for (const row of rows) {
                    const enriched = {
                        ...row,
                        source_table: entry.tableName,
                        source_origin: entry.source.origin || entry.source.name || entry.tableName
                    };

                    if ((row.region === undefined || row.region === null || row.region === '') && !('region' in enriched)) {
                        const inferredRegion = inferRegionFromTableName(entry.tableName, dominantToken);
                        if (inferredRegion) enriched.region = inferredRegion;
                    } else if (!row.region) {
                        const inferredRegion = inferRegionFromTableName(entry.tableName, dominantToken);
                        if (inferredRegion) enriched.region = inferredRegion;
                    }

                    combinedRows.push(enriched);
                }
            }

            if (combinedRows.length > 0) {
                groupedRowsByToken.set(dominantToken, combinedRows);
            }
        }

        for (const [dominantToken, combinedRows] of groupedRowsByToken.entries()) {
            if (combinedRows.length === 0) continue;
            if (!syntheticAdapter) {
                syntheticAdapter = new DuckDBAdapter({ path: ':memory:' });
                await syntheticAdapter.connect();
                extraAdapters.push(syntheticAdapter);
            }

            const syntheticName = `combined_${dominantToken}`;
            await StructuredDuckDBImportService.importTable(syntheticAdapter, syntheticName, combinedRows, {
                temporary: true,
                replace: true
            });

            const allColumns = [...new Set(combinedRows.flatMap((row) => Object.keys(row)))];
            if (!normalizedSchema.tables.includes(syntheticName)) {
                normalizedSchema.tables.push(syntheticName);
            }
            normalizedSchema.detailedSchema[syntheticName] = allColumns.map((name) => {
                const sampleValue = combinedRows.find((row) => row[name] !== undefined && row[name] !== null)?.[name];
                return {
                    name,
                    type: typeof sampleValue === 'number' ? 'DOUBLE' : 'VARCHAR',
                    nullable: true
                };
            });
            normalizedSchema.sourceRegistry[syntheticName] = {
                name: syntheticName,
                origin: 'Synthetic Combined Source',
                type: 'STRUCTURED',
                provider: 'duckdb',
                id: `synthetic:${syntheticName}`
            };
            normalizedSchema.tableDescriptions = normalizedSchema.tableDescriptions || {};
            normalizedSchema.tableDescriptions[syntheticName] = `Combined cross-source table for ${dominantToken}`;
            normalizedSchema.semanticContext = normalizedSchema.semanticContext || { knowledgeBase: [], sourceInsights: {} };
            normalizedSchema.semanticContext.sourceInsights = normalizedSchema.semanticContext.sourceInsights || {};
            normalizedSchema.semanticContext.sourceInsights[syntheticName] = [
                {
                    category: 'logic',
                    confidence: 0.98,
                    insight: `Use ${syntheticName} when comparing the same ${dominantToken} data across regions, markets, or sibling uploads.`
                }
            ];

            resourceToAdapter[syntheticName] = syntheticAdapter;
            resourceToProvider[syntheticName] = 'duckdb';
            resourceToAdapter[slug(syntheticName)] = syntheticAdapter;
            resourceToProvider[slug(syntheticName)] = 'duckdb';
            resourceToAdapter[dominantToken] = syntheticAdapter;
            resourceToProvider[dominantToken] = 'duckdb';
            resourceToAdapter[`all_${dominantToken}`] = syntheticAdapter;
            resourceToProvider[`all_${dominantToken}`] = 'duckdb';
            resourceToAdapter[`${dominantToken}_comparison`] = syntheticAdapter;
            resourceToProvider[`${dominantToken}_comparison`] = 'duckdb';

            syntheticTables.push(syntheticName);
            preferredComparisons[dominantToken] = syntheticName;
        }

        if (syntheticTables.length > 0) {
            normalizedSchema.semanticContext = normalizedSchema.semanticContext || { knowledgeBase: [], sourceInsights: {} };
            normalizedSchema.semanticContext.preferredComparisonTables = preferredComparisons;
        }

        return { syntheticTables, preferredComparisons };
    }
}
