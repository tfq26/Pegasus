/**
 * Data Fetching Prompt Logic
 * Handles schema discovery, source orchestration, and dialect-specific query generation.
 * Enhanced with conversation context and data profile awareness.
 */

import { CONTEXT_HIERARCHY } from './core.js';
import { getDialectPrompt } from './dialects.js';

export function buildFetchingPrompt(context, settings, intent) {
    const { schema, dialect, conversationContext, dataProfile } = context;
    const { customInstructions, aiDetail } = settings;

    // 1. Scratchpad (Reasoning Step)
    const scratchpadInstruction = `
Before calling any tools, you MUST write an internal plan to avoid hallucinations:
[SCRATCHPAD]
User wants: (summarize the request in your own words)
Is follow-up: ${conversationContext?.isFollowUp ? 'YES - build upon previous context' : 'NO - fresh query'}
Formatting/Refinement: (Note any specific formatting, labeling, or chart-type changes requested in this turn)
Relevant tables: (list exact table names found in schema below)
Approch: (If this is a follow-up, explain how you will modify the PREVIOUS approach to satisfy the and user's NEW formatting or grouping request)
[END SCRATCHPAD]
Then, and only then, call the query_data tool.
`;

    // 2. Detail Level & Intent Mode
    let detailInstruction = '';
    if (aiDetail === 0) {
        detailInstruction = '\nQUERY STYLE: Generate the most efficient and concise query possible. Avoid unnecessary columns.';
    } else if (aiDetail === 2) {
        detailInstruction = '\nQUERY STYLE: Ensure the query is comprehensive. Select all relevant columns.';
    }

    // Intent-specific instructions
    if (intent?.type === 'visualization' || intent?.secondaryIntent === 'visualization') {
        detailInstruction += '\nVISUALIZATION MODE: The user wants to see a chart. Prefer grouped aggregations (SUM, AVG, COUNT) that are suitable for charts over raw row listings. Limit to reasonable number of groups (<= 50).';
    }

    if (intent?.type === 'analysis') {
        detailInstruction += '\nANALYSIS MODE: Fetch comprehensive data to support deep insights. Include relevant dimensions for breakdown analysis.';
    }

    // 3. Conversation Context (for follow-ups)
    let conversationPrompt = '';
    if (conversationContext?.isFollowUp && conversationContext?.contextPrompt) {
        conversationPrompt = conversationContext.contextPrompt;
    }

    // 4. Data Profile Summary (if available)
    let profilePrompt = '';
    if (dataProfile && Object.keys(dataProfile).length > 0) {
        profilePrompt = buildDataProfilePrompt(dataProfile);
    }

    // 5. Components
    const dataSourceStrategy = buildDataSourceStrategy(schema);
    const { schemaPresentation, dialectInstructions } = buildDialectInstructions(dialect, schema, settings);
    const executionRules = buildExecutionRules();

    return `
${CONTEXT_HIERARCHY}

${conversationPrompt}

${dataSourceStrategy}

${schemaPresentation}

${profilePrompt}

${dialectInstructions}

${executionRules}

${scratchpadInstruction}
${detailInstruction}
${customInstructions ? `\nUSER INSTRUCTIONS: ${customInstructions}` : ''}
`.trim();
}

/**
 * Build data profile prompt section
 */
function buildDataProfilePrompt(dataProfile) {
    if (!dataProfile || dataProfile._meta?.isEmpty) {
        return '';
    }

    const lines = ['\n[DATA PROFILE - Use for smart column selection]:'];

    for (const [colName, info] of Object.entries(dataProfile)) {
        if (colName === '_meta') continue;
        if (typeof info !== 'object' || info.error) continue;

        let hint = `- ${colName}:`;

        if (info.chartRole === 'id') {
            hint += ' ID column (unique per row, NOT for grouping)';
        } else if (info.chartRole === 'x-axis-time') {
            hint += ` TIME column (good for trends, range ${info.range?.min} to ${info.range?.max})`;
        } else if (info.chartRole === 'x-axis-category') {
            hint += ` CATEGORY (${info.cardinality} unique values - good for GROUP BY)`;
            if (info.sampleValues?.length > 0) {
                hint += ` [${info.sampleValues.slice(0, 4).join(', ')}${info.sampleValues.length > 4 ? '...' : ''}]`;
            }
        } else if (info.chartRole === 'y-axis-metric') {
            hint += ` NUMERIC metric`;
            if (info.range) {
                hint += ` (range: ${info.range.min} - ${info.range.max})`;
            }
        } else if (info.isHighCardinality) {
            hint += ` HIGH CARDINALITY (${info.cardinality} values - avoid for grouping)`;
        }

        lines.push(hint);
    }

    return lines.join('\n');
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

STEP 4 - RESPONDING WITH DATA (CRITICAL):
✓ If [System Context - Intermediate Query Result] is present, you MUST include the data at the end of your response in JSON format.
✓ Format: You MUST use the exact prefix "Results: " followed by the JSON array.
✓ Example: "Here is the data found:\n\nResults: [{"col1": "val1"}]"
✓ CRITICAL: DO NOT use Markdown tables. ONLY use the "Results: " + JSON format.
✓ CRITICAL: DO NOT tell the user to "see the results panel". The chat message is the ONLY place data is displayed.
✓ Limit the JSON to the first 40 rows. If there are more, mention that in text.
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
