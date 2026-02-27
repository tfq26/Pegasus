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
    const { schemaPresentation, dialectInstructions } = buildDialectInstructions(dialect, schema, settings, context);
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

STEP 3 - SEMANTIC CONCEPT RESOLUTION (Schema-Aware):
When the user asks about an ABSTRACT concept (health, performance, risk, efficiency, popularity, quality, activity, etc.)
you MUST NOT apply any pre-assumed definition. Instead:

1. CHECK CONVERSATION HISTORY FIRST:
   - If the user has ALREADY DEFINED the concept in a previous message (e.g. "healthy means uptime > 99%" or "by risk I mean orders over $10k"),
     you MUST use that definition as ground truth — do not redefine it.
   - User-provided definitions ALWAYS override schema-inferred ones.

2. SCAN the schema for semantically meaningful columns that relate to the concept:
   - Identify the data DOMAIN first (e.g. server metrics, sales, finance, logistics, user activity, IoT).
   - Map the abstract concept to columns that exist in THIS dataset:

   CONCEPT         | LIKELY COLUMNS TO LOOK FOR
   --------------- | ----------------------------------------------------------
   Health / Status | status, state, is_active, health, uptime, error_message
   Performance     | latency, response_time, throughput, fps, requests_per_sec
   Risk            | risk_score, volatility, drawdown, error_rate, churn_rate
   Efficiency      | cost_per_unit, ops_per_dollar, utilization, waste
   Popularity      | views, downloads, clicks, sales_count, likes, engagement
   Quality         | defect_rate, return_rate, nps, rating, score, accuracy
   Activity        | last_login, session_count, last_updated, event_count
   Anomaly         | any numeric column — flag values beyond 2 standard deviations
   Trend           | any timestamp + any numeric metric — compute rate of change
   Top/Bottom      | any numeric column ranked high or low relative to peers

3. DEFINE the concept from the data, not from assumptions:
   - Use the actual distinct values (for categorical columns) or statistical distribution (for numeric columns).
   - Never hardcode thresholds like '>80%' unless the schema or user explicitly provides them.
   - Compare against the dataset's own average, median, or prior period — not external benchmarks.

4. ALWAYS state your interpretation at the start of your response:
   e.g. "For this dataset, I'm interpreting 'healthy' as status='online' with errorMessage=null,
   since those are the only health-signal columns present. Here's what I found:"

5. CONFIDENCE ASSESSMENT (run before EVERY response):
   Before deciding whether to ask a question or proceed, score your confidence (0-100) at interpreting
   the user's request given the schema columns you found, all prior turns, and any user-defined terms.

   Confidence scoring guide:
   - 95-100%: Schema maps well to the concept. Proceed immediately.
   - 80-94%:  Good enough. Proceed — state your interpretation assumption in the first sentence.
   - 60-79%:  One critical piece is unclear AND without it you'd return completely wrong data. Ask ONE question.
   - Below 60%: No clear schema match at all. Ask ONE question.

   ════════════════════════════════════════════════════════════════
   STRONG BIAS TO PROCEED — READ THIS FIRST:
   ════════════════════════════════════════════════════════════════
   IF the schema contains ANY plausible column for the concept → PROCEED. Do NOT ask.
   State your assumption in the opening sentence and answer the question.

   You MUST NOT ask a question in ANY of these situations:
   ✗ The schema has a 'status', 'state', 'is_active', or similar column → assume it defines health/status.
   ✗ The request mentions "high", "low", "top", "bottom", "most", "least" → use column rank/ordering.
   ✗ A concept like "healthy", "at risk", "active", "recent" maps to any schema column → infer and proceed.
   ✗ Only the threshold is unknown (e.g. "high CPU") → use the dataset median/p75 as the threshold and state it.
   ✗ The user has asked this type of question before in the conversation → reuse the prior interpretation.
   ✗ You have already asked 1 clarifying question in this thread → you MUST proceed regardless of confidence.
   ════════════════════════════════════════════════════════════════

   RULE: If confidence >= 80%, you MUST proceed with an answer — do NOT ask a question.
   RULE: If confidence < 80%, output ONLY the clarification JSON:
     {
       "type": "clarification",
       "question": "<one focused question>",
       "interpretation": "<what you inferred so far>",
       "confidence": <0-79>,
       "hints": [
         {
           "column": "<column name>",
           "dataType": "<e.g. number 0-100, string, datetime, boolean>",
           "examples": ["<real example 1>", "<real example 2>", "<real example 3>"],
           "range": "<e.g. min: 5.2, max: 98.7, avg: 42.1 — omit if not applicable>"
         }
       ]
     }

   HINTS RULE: When your question asks the user to provide a threshold, value, or format-specific answer,
   you MUST populate "hints" with the relevant columns.
   - Use get_sample_data FIRST to fetch real values, then extract examples, min, max, and format.
   - If you cannot fetch sample data, still include the "hints" array with just the dataType inferred from the schema.
   - This shows the user what format/range they are working with before they answer.
   - If the question is purely conceptual (not about specific values), "hints" may be an empty array [].

   RULE: NEVER ask more than 1 clarifying question total per conversation thread.
   After asking once, you MUST proceed with your best interpretation at whatever confidence you have.

   ALWAYS include your confidence score in your final answer (when you do proceed):
   - Add a line at the end of your response: "**Confidence: XX%** — [one-sentence explanation of any key assumption you made]"
   - Example: "**Confidence: 87%** — I assumed 'healthy' means status='online' since no threshold was specified."

6. If no relevant columns exist for the concept, say so directly and suggest what data the user could add.

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
export function buildDialectInstructions(dialect, schema, settings, context = {}) {
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
                const isRelevant = table === activeTable ||
                    tables.indexOf(table) < 5 ||
                    (context.userMessage && context.userMessage.toLowerCase().includes(table.toLowerCase()));

                if (isRelevant) {
                    schemaPresentation += `Table: ${table}\nColumns:\n`;
                    columns.forEach(col => {
                        schemaPresentation += `  - ${col.name} (${col.type})${col.pk ? ' [PK]' : ''}\n`;
                    });
                } else {
                    schemaPresentation += `Table: ${table} (Columns hidden - YOU MUST call 'get_table_schema' to see columns)\n`;
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
