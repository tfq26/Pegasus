/**
 * Data Fetching Prompt Logic
 * Handles schema discovery, source orchestration, and dialect-specific query generation.
 */

import { CONTEXT_HIERARCHY } from './core.js';
import { getDialectPrompt } from './dialects.js';

export function buildFetchingPrompt(context, settings, intent) {
    const { schema, dialect } = context;
    const { customInstructions, aiDetail } = settings;

    // 1. Scratchpad (New Feature)
    const scratchpadInstruction = `
Before calling any tools, you MUST write an internal plan to avoid hallucinations:
[SCRATCHPAD]
User wants: (summarize)
Relevant tables: (list exact table names found in schema below)
My approach: (describe the query intent)
[END SCRATCHPAD]
Then, and only then, call the query_data tool.
`;

    // 2. Detail Level
    let detailInstruction = '';
    if (aiDetail === 0) {
        detailInstruction = '\nQUERY STYLE: Generate the most efficient and concise query possible. Avoid unnecessary columns.';
    } else if (aiDetail === 2) {
        detailInstruction = '\nQUERY STYLE: Ensure the query is comprehensive. Select all relevant columns.';
    }

    if (intent?.type === 'visualization') {
        detailInstruction += '\nVISUALIZATION MODE: The user has explicitly requested a visualization. Prefer grouped aggregations (SUM, AVG, COUNT) that are suitable for charts over raw row listings.';
    }

    // 3. Components
    const dataSourceStrategy = buildDataSourceStrategy(schema);
    const { schemaPresentation, dialectInstructions } = buildDialectInstructions(dialect, schema, settings);
    const executionRules = buildExecutionRules();

    return `
${CONTEXT_HIERARCHY}

${dataSourceStrategy}

${schemaPresentation}

${dialectInstructions}

${executionRules}

${scratchpadInstruction}
${detailInstruction}
${customInstructions ? `\nUSER INSTRUCTIONS: ${customInstructions}` : ''}
`.trim();
}

function buildDataSourceStrategy(schema) {
    const tables = schema.tables || schema.collections || [];
    const registry = schema.sourceRegistry || {};
    const unloaded = schema.unloadedResources || [];

    // Group tables by origin
    const grouped = {};
    tables.forEach(t => {
        const origin = registry[t]?.origin || 'Main Connection';
        if (!grouped[origin]) grouped[origin] = [];
        grouped[origin].push(t);
    });

    let tableList = '';
    Object.entries(grouped).forEach(([origin, tables]) => {
        tableList += `- DATASET: ${origin} (Provider: ${registry[tables[0]]?.provider || 'default'})\n`;
        tables.forEach(t => {
            tableList += `   |_ ${t}\n`;
        });
    });

    return `
SOURCE ORCHESTRATION ENGINE:
[STATUS: ALL LISTED SOURCES ARE LOADED AND READY FOR QUERYING]

LOADED & READY (Use 'query_data' tool on these immediately):
${tableList}

UNAVAILABLE / NOT IN CONTEXT:
${unloaded.length > 0 ? unloaded.map(u => `- ${u.name}`).join('\n') : '- (None)'}
`.trim();
}

function buildExecutionRules() {
    return `
QUERY EXECUTION RULES:

STEP 0 - DISCOVERY & INSPECTION (MANDATORY):
✓ Check if headers are generic ("Field1", "column_0").
✓ If generic, you MUST call 'get_sample_data' (limit 10) to identify real column meanings.

STEP 1 - ANALYZE THE REGISTRY:
✓ Identify STRUCTURED vs UNSTRUCTURED sources.
✓ Note the ORIGIN of each source.

STEP 2 - CROSS-SOURCE ORCHESTRATION:
✓ For "Show me" or "Calculations" -> Use query_data on Structured sources.
✓ For "Strategy" -> Reference Unstructured sources in Knowledge Base.

STEP 3 - VERIFY AND CITE:
✓ ALWAYS cite the origin: [Source: OriginName].
`.trim();
}

/**
 * Generates dialect-specific instructions (SQL, Mongo, Surreal, Kusto)
 */
export function buildDialectInstructions(dialect, schema, settings) {
    let schemaPresentation = '';
    const activeTable = settings.activeTable || schema.activeTable;

    // --- Schema Presentation Logic ---
    if (dialect === 'mongodb') {
        const collections = schema.collections || schema.tables || [];
        schemaPresentation = `\nAvailable Collections: ${collections.join(', ')}\n`;
    } else if (dialect === 'cosmosdb') {
        schemaPresentation = `\nCosmos DB Container: ${(schema.tables || []).join(', ')}\n`;
    } else if (dialect === 'surrealdb') {
        schemaPresentation = `\nAvailable Tables: ${(schema.tables || []).join(', ')}\n`;
    } else {
        const tables = schema.tables || [];
        schemaPresentation = `\nDatabase Schema:\n`;
        if (schema.detailedSchema) {
            Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
                const isRelevant = table === activeTable || tables.length <= 15;
                if (isRelevant) {
                    schemaPresentation += `Table: ${table}\nColumns:\n`;
                    columns.forEach(col => {
                        schemaPresentation += `  - ${col.name} (${col.type})${col.pk ? ' [PK]' : ''}\n`;
                    });
                } else {
                    schemaPresentation += `Table: ${table} (Columns hidden - query to inspect)\n`;
                }
            });
        } else {
            schemaPresentation += tables.map(t => `- ${t}`).join('\n');
        }
    }

    // Append table-level details for NoSQL/NewSQL
    if (['cosmosdb', 'surrealdb', 'mongodb'].includes(dialect) && schema.detailedSchema) {
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
            schemaPresentation += `Table: ${table}\n`;
            columns.forEach(c => schemaPresentation += ` - ${c.name} (${c.type})\n`);
        });
    }

    // --- Dynamic Dialect Instructions (from Dictionary) ---
    const formatInstructions = getDialectPrompt(dialect);

    return { schemaPresentation, dialectInstructions: formatInstructions };
}
