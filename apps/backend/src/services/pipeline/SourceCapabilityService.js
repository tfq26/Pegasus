const STRUCTURED_PROVIDERS = new Set([
    'postgres',
    'mysql',
    'sqlite',
    'duckdb',
    'file',
    'local',
    'surrealdb',
    'cosmosdb',
    'mongodb',
    'kusto'
]);

const SEMI_STRUCTURED_PROVIDERS = new Set(['duckdb', 'sqlite', 'file', 'local']);
const TEXT_TYPES = new Set(['note', 'chunk', 'research_note']);

export class SourceCapabilityService {
    static forResource(resource = {}) {
        const type = String(resource.type || '').toLowerCase();
        const provider = String(resource.provider || resource.type || '').toLowerCase();
        const isUnstructured = TEXT_TYPES.has(type) || provider === 'notes';
        const isStructured = !isUnstructured && (type === 'database' || STRUCTURED_PROVIDERS.has(provider));
        const isSemiStructured = !isUnstructured && (type === 'file' || SEMI_STRUCTURED_PROVIDERS.has(provider));

        return {
            canListTables: isStructured,
            canGetSchema: isStructured,
            canSampleRows: isStructured,
            canRunQuery: isStructured,
            canSearchText: isUnstructured,
            supportsAggregation: isStructured,
            supportsFiltering: isStructured,
            supportsTimeSeries: isStructured,
            supportsCrossSourceJoin: false,
            isStructured,
            isSemiStructured,
            isUnstructured
        };
    }

    static summarize(capabilities) {
        if (!capabilities) return 'unknown';
        if (capabilities.isUnstructured) return 'text';
        if (capabilities.isSemiStructured) return 'semi-structured';
        if (capabilities.isStructured) return 'structured';
        return 'unknown';
    }
}
