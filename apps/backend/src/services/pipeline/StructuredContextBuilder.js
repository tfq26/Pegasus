import { DataContextService } from '../DataContextService.js';
import { SourceCapabilityService } from './SourceCapabilityService.js';

function tokenize(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreTable(tableName, prompt, activeTable) {
    const lowerTable = String(tableName || '').toLowerCase();
    const promptTerms = tokenize(prompt);
    const promptSlug = slugify(prompt);
    const tableSlug = slugify(tableName);
    let score = activeTable === tableName ? 50 : 0;
    if (tableSlug && promptSlug.includes(tableSlug)) score += 80;
    for (const term of promptTerms) {
        if (lowerTable.includes(term)) score += 5;
    }
    return score;
}

function normalizeColumns(columns = []) {
    return columns.map((column) => ({
        name: column.name || column.column_name,
        type: column.type || column.dataType || column.data_type || 'unknown'
    })).filter((column) => column.name);
}

function numericColumns(columns = []) {
    return columns
        .filter((column) => /(int|decimal|numeric|double|float|real|number|money|currency)/i.test(String(column.type || '')))
        .map((column) => column.name);
}

export class StructuredContextBuilder {
    async build({ userId, sourceCandidate, prompt, activeTable, adHocSchema, modelId }) {
        if (!sourceCandidate?.capabilities?.isStructured) return null;
        const resource =
            sourceCandidate.resource?.type === 'database'
                ? {
                    ...sourceCandidate.resource,
                    type: sourceCandidate.resource.provider || sourceCandidate.provider,
                    provider: sourceCandidate.resource.provider || sourceCandidate.provider
                }
                : sourceCandidate.resource;

        const contextData = await DataContextService.buildContext(userId, resource, {
            activeTable,
            adHocSchema,
            resolvedResources: [],
            userMessage: prompt,
            modelId,
            includeSiblingUploads: false,
            includeCrossSourceAugmentation: false,
            includeSemanticSpark: false,
            includeRagKnowledge: false
        });

        const tableNames = contextData.normalizedSchema.tables || [];
        const rankedTables = [...tableNames]
            .sort((a, b) => scoreTable(b, prompt, activeTable) - scoreTable(a, prompt, activeTable));

        const detailedTables = rankedTables.slice(0, 3).map((tableName) => {
            const columns = normalizeColumns(contextData.normalizedSchema.detailedSchema?.[tableName] || []);
            return {
                name: tableName,
                columns: columns.slice(0, 20),
                numericColumns: numericColumns(columns),
                hasGenericHeaders: columns.some((column) => /^field[0-9]+$/i.test(column.name) || /^column_[0-9]+$/i.test(column.name) || /^[a-z]$/i.test(column.name))
            };
        });

        return {
            source: sourceCandidate,
            capabilities: SourceCapabilityService.forResource(sourceCandidate.resource),
            contextData,
            summary: {
                defaultTable: activeTable || detailedTables[0]?.name || rankedTables[0] || null,
                tables: detailedTables,
                additionalTables: rankedTables.slice(3, 11)
            }
        };
    }
}
