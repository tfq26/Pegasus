import { RAGService } from './ragService.js';
import { logger } from './Logger.js';

const verboseTableDiscoveryLogs = process.env.PEGASUS_VERBOSE_TABLE_DISCOVERY === 'true';
const logTableDiscoveryDebug = (message) => {
    if (verboseTableDiscoveryLogs) {
        logger.debug(message);
    }
};

const COMPARISON_WORDS = [
    'compare', 'comparison', 'best', 'highest', 'lowest', 'top', 'most', 'least',
    'market', 'region', 'across', 'overall'
];

function tokenize(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Table Discovery Service
 * Uses hybrid search (Semantic RAG + Keyword) to find the best matching table for a query.
 */
export class TableDiscoveryService {
    /**
     * Discover relevant tables for a user question.
     * @param {string} query - User question
     * @param {string} userId - User ID
     * @param {object} schema - Normalized schema from DataContext
     * @returns {Promise<Array>} List of candidate tables with scores
     */
    static async discover(query, userId, schema) {
        logTableDiscoveryDebug(`[TableDiscovery] Discovering tables for: "${query}"`);
        const lowerQuery = query.toLowerCase();
        const queryTokens = new Set(tokenize(query));
        const isComparisonQuery = COMPARISON_WORDS.some((word) => lowerQuery.includes(word));

        // 1. Semantic Search via RAG
        const ragResults = await RAGService.hybridSearch(query, userId, 5);
        
        // 2. Score and Rank
        const candidates = new Map();

        // 2.1 Process RAG hits
        ragResults.forEach(res => {
            const tableName = res.metadata?.tableName || res.metadata?.source;
            if (tableName && schema.tables.includes(tableName)) {
                const current = candidates.get(tableName) || { score: 0, reasons: [] };
                current.score = Math.max(current.score, res.score || 0.5);
                current.reasons.push(`Matched via RAG: ${res.content.substring(0, 50)}...`);
                candidates.set(tableName, current);
            }
        });

        // 2.2 Keyword matching against table names and common aliases
        schema.tables.forEach(t => {
            const lowTable = t.toLowerCase();
            const current = candidates.get(t) || { score: 0, reasons: [] };
            const tableTokens = tokenize(t);
            const tokenOverlap = tableTokens.filter((token) => queryTokens.has(token)).length;
            const description = schema.tableDescriptions?.[t] || schema.sourceRegistry?.[t]?.origin || '';
            const detailColumns = Array.isArray(schema.detailedSchema?.[t]) ? schema.detailedSchema[t].map((column) => column.name) : [];

            if (lowerQuery.includes(lowTable) || lowTable.includes(lowerQuery)) {
                current.score += 0.4;
                current.reasons.push(`Direct keyword match: ${t}`);
            }

            if (tokenOverlap > 0) {
                current.score += Math.min(0.15 * tokenOverlap, 0.45);
                current.reasons.push(`Token overlap with question: ${tokenOverlap}`);
            }

            if (description && queryTokens.size > 0) {
                const descriptionTokens = new Set(tokenize(description));
                const descriptionOverlap = [...queryTokens].filter((token) => descriptionTokens.has(token)).length;
                if (descriptionOverlap > 0) {
                    current.score += Math.min(0.1 * descriptionOverlap, 0.3);
                    current.reasons.push(`Description overlap: ${descriptionOverlap}`);
                }
            }

            if (isComparisonQuery && t.startsWith('combined_')) {
                current.score += 0.75;
                current.reasons.push('Comparison query prefers combined cross-source table');
            }

            if (isComparisonQuery && (queryTokens.has('market') || queryTokens.has('region')) && detailColumns.includes('region')) {
                current.score += 0.35;
                current.reasons.push('Has region column for market comparison');
            }

            if (current.score > 0) {
                candidates.set(t, current);
            }
        });

        // 3. Finalize and Sort
        const results = Array.from(candidates.entries()).map(([name, data]) => ({
            tableName: name,
            confidence: Math.min(data.score, 1.0),
            reasons: data.reasons
        })).sort((a, b) => b.confidence - a.confidence);

        logTableDiscoveryDebug(`[TableDiscovery] Found ${results.length} candidates. Top: ${results[0]?.tableName || 'None'} (${results[0]?.confidence || 0})`);
        
        return results;
    }

    /**
     * Index a table's metadata for semantic discovery.
     */
    static async indexTableMetadata(tableName, metadata, userId) {
        const content = `Table: ${tableName}\nDescription: ${metadata.description || 'No description'}\nColumns: ${Object.keys(metadata.columns).join(', ')}\nUnique Terms: ${metadata.uniqueTerms.join(', ')}`;
        
        await RAGService.indexChunks([content], {
            source: tableName,
            tableName: tableName,
            type: 'table_metadata',
            source_id: `table_meta_${tableName}`
        }, userId);
    }
}
