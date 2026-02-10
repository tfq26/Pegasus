# Pegasus AI Data Flow & Intent Understanding - Analysis & Improvement Plan

## Executive Summary

After analyzing the current AI architecture, I've identified **7 key improvement areas** that can significantly enhance how Pegasus understands user intent and responds to data queries. The current system is solid but has gaps in semantic understanding, context retention, and proactive assistance.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER INPUT (Prompt)                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  1. INTENT CLASSIFICATION (intent.js)                                     │
│     - Keyword matching (chart, graph, plot, select, why, etc.)            │
│     - Slash command detection (/visualization, /query)                    │
│     - Returns: { type: 'visualization'|'query'|'analysis'|'chat' }        │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  2. CONTEXT RESOLUTION (OneContext.js + DataContextService.js)            │
│     - Parse explicit mentions (@, #, !, $, *)                             │
│     - Resolve to database resources                                       │
│     - Run implicit discovery (vector search, keyword matching)            │
│     - Build schema context with table/column metadata                     │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  3. PROMPT CONSTRUCTION (PromptBuilder.js + fetching.js)                  │
│     - Build dialect-specific instructions (SQL, MongoDB, Cosmos)          │
│     - Include schema presentation                                         │
│     - Add scratchpad for reasoning                                        │
│     - Inject execution rules                                              │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  4. AI GENERATION (chat.js agentic loop)                                  │
│     - Stream response with tool calls                                     │
│     - Execute query_data, get_sample_data tools                           │
│     - Handle visualization vs text output                                 │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  5. POST-PROCESSING                                                       │
│     - VisualizationAnalyzer for chart decisions                           │
│     - Analysis prompt for insights                                        │
│     - Response cleaning and formatting                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Improvement Areas

### 1. 🧠 **Intent Classification Overhaul**

**Current State:**
- Simple keyword matching in `intent.js`
- Binary classification (has keywords → intent type)
- No confidence scoring
- No context awareness

**Problems:**
- "Show me revenue trends" → classified as `query` (misses visualization aspect)
- "Why is Q1 down?" → classified as `analysis` (but needs data first)
- Ambiguous phrases like "breakdown of sales" → unclear intent

**Proposed Solution: Semantic Intent Classifier**

```javascript
// New: ai/prompts/semantic_intent.js

export async function classifyIntentSemantic(message, context, modelId, userId) {
    const { schema, conversationHistory, activeTable } = context;
    
    const prompt = `
You are an intent classifier for a data analysis platform.

USER MESSAGE: "${message}"

AVAILABLE DATA CONTEXT:
- Active Table: ${activeTable || 'None'}
- Available Tables: ${schema?.tables?.slice(0, 10).join(', ') || 'Unknown'}
- Recent Conversation: ${conversationHistory?.slice(-3).map(m => m.content?.substring(0, 100)).join(' | ') || 'None'}

CLASSIFY THE INTENT:
Return a JSON object with:
{
  "primaryIntent": "visualization" | "query" | "analysis" | "chat" | "action",
  "secondaryIntent": null | "visualization" | "query" | "analysis",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "suggestedApproach": "description of what the AI should do",
  "dataNeeded": ["list", "of", "tables/columns"],
  "outputFormat": "chart" | "table" | "text" | "mixed"
}

EXAMPLES:
- "Show me revenue trends" → primaryIntent: "query", secondaryIntent: "visualization"
- "Why is Q1 down?" → primaryIntent: "analysis", dataNeeded: ["quarterly data"]
- "Create a pie chart of sales by region" → primaryIntent: "visualization", force: true
`;
    
    // Call AI for semantic classification
    const response = await aiClient.generateContent([
        { role: 'user', content: prompt }
    ], { model: modelId, json: true, userId });
    
    return JSON.parse(response);
}
```

**Impact:** More accurate intent detection, especially for complex multi-step requests.

---

### 2. 📊 **Data Profile Awareness**

**Current State:**
- Schema shows table names and column types
- Sample values are fetched but not analyzed
- No understanding of data distributions or patterns

**Problems:**
- AI doesn't know if "region" column has 5 values or 500
- Can't suggest appropriate chart types based on cardinality
- May try to plot 10,000 categories on X-axis

**Proposed Solution: Auto-Generated Data Profiles**

```javascript
// New: services/DataProfiler.js

export class DataProfiler {
    static async profile(adapter, tableName, columns) {
        const profile = {};
        
        for (const col of columns) {
            const stats = await adapter.query(`
                SELECT 
                    COUNT(DISTINCT "${col.name}") as cardinality,
                    COUNT(*) as total_rows,
                    MIN("${col.name}") as min_val,
                    MAX("${col.name}") as max_val,
                    ${col.type.includes('int') || col.type.includes('float') ? 
                        `AVG("${col.name}") as avg_val, STDDEV("${col.name}") as stddev` : 
                        'NULL as avg_val, NULL as stddev'}
                FROM "${tableName}"
            `);
            
            profile[col.name] = {
                type: col.type,
                cardinality: stats[0].cardinality,
                totalRows: stats[0].total_rows,
                cardinalityRatio: stats[0].cardinality / stats[0].total_rows,
                isHighCardinality: stats[0].cardinality > 50,
                isLikelyCategory: stats[0].cardinality < 20,
                isLikelyId: stats[0].cardinality === stats[0].total_rows,
                range: { min: stats[0].min_val, max: stats[0].max_val },
                stats: { avg: stats[0].avg_val, stddev: stats[0].stddev }
            };
        }
        
        return profile;
    }
}
```

**Inject into System Prompt:**
```
DATA PROFILE for "sales_data":
- region: VARCHAR, 5 unique values (Low Cardinality - good for grouping/X-axis)
- product_id: VARCHAR, 2,500 unique (High Cardinality - NOT suitable for charts)
- revenue: DECIMAL, range $10 - $50,000, avg $2,340 (Numeric - suitable for Y-axis)
- date: DATE, range 2023-01-01 to 2024-12-31 (Time series - suitable for X-axis)
```

**Impact:** AI makes smarter chart decisions and avoids hairball visualizations.

---

### 3. 💬 **Conversation-Aware Context**

**Current State:**
- Each message is processed independently
- No memory of what was discussed
- Same data is re-fetched on follow-up questions

**Problems:**
- User: "Show me sales by region" → AI generates chart
- User: "Now break it down by product" → AI loses context, asks "which table?"

**Proposed Solution: Conversation State Manager**

```javascript
// New: services/ConversationState.js

export class ConversationState {
    static async buildContext(chatId, currentMessage, schema) {
        // 1. Fetch recent messages
        const history = await db.select()
            .from(chats)
            .where(eq(chats.id, chatId))
            .limit(1);
        
        const messages = history[0]?.messages || [];
        const lastN = messages.slice(-6); // Last 3 exchanges
        
        // 2. Extract entities from history
        const entities = {
            lastTable: null,
            lastColumns: [],
            lastFilters: [],
            lastAggregation: null,
            lastVisualization: null
        };
        
        for (const msg of lastN) {
            if (msg.role === 'assistant' && msg.toolCalls) {
                for (const call of msg.toolCalls) {
                    if (call.function?.name === 'query_data') {
                        const args = JSON.parse(call.function.arguments);
                        entities.lastTable = args.table;
                        // Parse SQL to extract columns, filters, etc.
                    }
                    if (call.function?.name === 'generate_visualization') {
                        entities.lastVisualization = JSON.parse(call.function.arguments);
                    }
                }
            }
        }
        
        // 3. Detect follow-up patterns
        const isFollowUp = this.detectFollowUp(currentMessage);
        
        return {
            history: lastN,
            entities,
            isFollowUp,
            contextPrompt: this.buildContextPrompt(entities, isFollowUp)
        };
    }
    
    static detectFollowUp(message) {
        const followUpPatterns = [
            /^(now|also|and|but|what about|how about)/i,
            /^(break|split|group|filter|show|compare) (it|this|that)/i,
            /^(same|similar|like before)/i,
            /^(instead|rather|change)/i
        ];
        return followUpPatterns.some(p => p.test(message));
    }
    
    static buildContextPrompt(entities, isFollowUp) {
        if (!isFollowUp) return '';
        
        return `
CONVERSATION CONTEXT:
- User is continuing from a previous query
- Last table used: ${entities.lastTable || 'Unknown'}
- Last columns analyzed: ${entities.lastColumns.join(', ') || 'Unknown'}
- Last visualization: ${entities.lastVisualization?.type || 'None'}

FOLLOW-UP RULE: Assume the user wants to modify the PREVIOUS query/output.
If they say "break it down by X", add X to the GROUP BY of the last query.
If they say "filter by X", add WHERE clause.
If they say "show it as a chart", use generate_visualization on the SAME data.
`;
    }
}
```

**Impact:** Natural follow-up conversations without losing context.

---

### 4. 🎯 **Proactive Disambiguation**

**Current State:**
- AI guesses when terms are ambiguous
- No user confirmation for uncertain matches
- Silent failures when data isn't found

**Problems:**
- User says "revenue" but column is named "total_sales"
- AI picks wrong table when multiple match
- Fuzzy matching sometimes wrong

**Proposed Solution: Disambiguation Dialog**

```javascript
// Modify: buildFetchingPrompt to include disambiguation logic

const DISAMBIGUATION_PROTOCOL = `
DISAMBIGUATION PROTOCOL:
When the user's request is ambiguous, DO NOT GUESS. Instead:

1. MULTIPLE TABLE CANDIDATES:
   If "sales" could match "sales_2023", "sales_archive", or "sales_forecast":
   → Call 'request_clarification' tool with options
   → Example: request_clarification({ 
       question: "Which sales data did you mean?",
       options: ["sales_2023 (Current Year)", "sales_archive (Historical)", "sales_forecast (Predictions)"]
     })

2. COLUMN AMBIGUITY:
   If user says "revenue" but you find "total_revenue", "net_revenue", "gross_revenue":
   → Assume the most general one (total_revenue) but NOTE the assumption
   → Add disclaimer: "[Assumed: total_revenue. Other options: net_revenue, gross_revenue]"

3. FILTER VALUE UNCERTAINTY:
   If user says "last quarter" but you don't know fiscal year:
   → Use calendar quarter as default
   → Add disclaimer: "[Assumed: Calendar Q (Oct-Dec). Adjust if using fiscal calendar.]"
`;
```

**New Tool: request_clarification**

```javascript
{
    name: 'request_clarification',
    description: 'Ask the user to clarify ambiguous request',
    parameters: {
        question: { type: 'string', description: 'The clarification question' },
        options: { type: 'array', items: { type: 'string' }, description: 'Possible choices' }
    }
}
```

**Impact:** Reduces wrong assumptions, increases user trust.

---

### 5. 📝 **Enhanced Knowledge Base Integration**

**Current State:**
- Knowledge Base is injected as text blocks
- No structured extraction of entities
- RAG results are generic snippets

**Problems:**
- AI doesn't know "APAC includes Japan, China, Australia"
- Business glossary terms not understood
- Company-specific metrics undefined

**Proposed Solution: Structured Knowledge Graph**

```javascript
// New: services/KnowledgeGraph.js

export class KnowledgeGraph {
    static async buildEntityMap(userId, spaceId) {
        // 1. Fetch knowledge chunks
        const chunks = await db.select()
            .from(knowledgeChunks)
            .where(eq(knowledgeChunks.spaceId, spaceId));
        
        // 2. Extract entities using AI
        const entityMap = {
            regions: {},      // { "APAC": ["Japan", "China", "Australia"] }
            metrics: {},      // { "ARR": { formula: "MRR * 12", type: "currency" } }
            glossary: {},     // { "churn": "Percentage of customers who cancel" }
            hierarchies: {}   // { "products": { "Electronics": ["Phones", "Tablets"] } }
        };
        
        for (const chunk of chunks) {
            const entities = await this.extractEntities(chunk.content);
            this.mergeEntities(entityMap, entities);
        }
        
        return entityMap;
    }
    
    static buildKnowledgePrompt(entityMap) {
        return `
BUSINESS GLOSSARY:
${Object.entries(entityMap.glossary).map(([term, def]) => `- ${term}: ${def}`).join('\n')}

REGION MAPPINGS:
${Object.entries(entityMap.regions).map(([region, countries]) => 
    `- ${region} includes: ${countries.join(', ')}`
).join('\n')}

METRIC DEFINITIONS:
${Object.entries(entityMap.metrics).map(([metric, info]) => 
    `- ${metric}: ${info.formula || info.description}`
).join('\n')}
`;
    }
}
```

**Impact:** AI understands company-specific terminology and relationships.

---

### 6. 🔄 **Smart Query Repair**

**Current State:**
- Query errors are returned to user
- No automatic retry with fixes
- Dialect errors are cryptic

**Problems:**
- "Column 'Revenue' not found" (case sensitivity)
- "Invalid syntax near ORDER BY" (Cosmos DB limitation)
- User sees raw SQL errors

**Proposed Solution: Query Repair Loop**

```javascript
// Add to chat.js tool execution loop

async function executeQueryWithRepair(adapter, query, dialect, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await adapter.query(query);
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            const repair = await repairQuery(query, error.message, dialect);
            if (repair.fixed) {
                console.log(`[QueryRepair] Attempt ${attempt + 1}: ${repair.explanation}`);
                query = repair.newQuery;
            } else {
                throw error;
            }
        }
    }
}

async function repairQuery(query, error, dialect) {
    const prompt = `
A ${dialect} query failed with error: "${error}"

Original Query:
${query}

Common fixes for ${dialect}:
- Case sensitivity: Use double quotes for mixed-case identifiers
- Cosmos DB ORDER BY: Cannot use expressions, use alias or remove ORDER BY
- DuckDB casting: Use CAST() for type mismatches
- NULL handling: Use COALESCE() or IS NULL checks

Return JSON:
{
  "fixed": true/false,
  "newQuery": "the corrected query",
  "explanation": "what was wrong and how you fixed it"
}
`;
    
    const response = await aiClient.generateContent([
        { role: 'user', content: prompt }
    ], { json: true });
    
    return JSON.parse(response);
}
```

**Impact:** Fewer query failures, more resilient system.

---

### 7. 📈 **Visualization Intelligence**

**Current State:**
- VisualizationAnalyzer runs AFTER data is fetched
- Chart type is decided by a separate AI call
- No consideration of data distribution

**Problems:**
- Line chart chosen for 3 data points (should be bar)
- Pie chart with 50 slices (unreadable)
- Time series without date sorting

**Proposed Solution: Integrated Visualization Logic**

```javascript
// Enhance: prompts/visualization.js

export function buildVisualizationPrompt(originalPrompt, data, forceVisualization, dataProfile) {
    const columnNames = data?.length > 0 ? Object.keys(data[0]) : [];
    const rowCount = data?.length || 0;
    
    // Auto-detect best chart candidates
    const candidates = analyzeChartCandidates(columnNames, dataProfile, rowCount);
    
    return `
You are a data visualization expert.

USER REQUEST: "${originalPrompt}"
ROW COUNT: ${rowCount}

COLUMN ANALYSIS:
${candidates.map(c => `- ${c.column}: ${c.suggestion} (${c.reason})`).join('\n')}

AUTOMATIC RULES:
${rowCount < 5 ? '⚠️ Low data density: Consider stat/KPI card instead of chart' : ''}
${rowCount > 500 ? '⚠️ High density: MUST aggregate data before charting' : ''}
${candidates.some(c => c.isHighCardinality) ? '⚠️ High cardinality column detected: Do NOT use for X-axis categories' : ''}

CHART TYPE GUIDANCE:
- bar: Best for ${rowCount} rows with categorical X (< 15 categories)
- line: Best for time-series with date/time X-axis (sorted data only)
- pie: Only for proportions with <= 8 slices
- stat: Single value KPIs, counters, totals
- scatter: Correlation between two numeric columns

Return JSON with your recommendation.
`;
}

function analyzeChartCandidates(columns, profile, rowCount) {
    return columns.map(col => {
        const p = profile?.[col] || {};
        return {
            column: col,
            isHighCardinality: p.cardinality > 30,
            isLikelyCategory: p.cardinalityRatio < 0.1 && p.cardinality < 20,
            isTimeColumn: /date|time|timestamp|created|updated/i.test(col),
            isNumeric: /int|float|decimal|number/i.test(p.type),
            suggestion: getSuggestion(col, p, rowCount),
            reason: getReason(col, p)
        };
    });
}
```

**Impact:** Smarter chart choices, no more unreadable visualizations.

---

## Implementation Priority

| Priority | Improvement | Effort | Impact |
|----------|------------|--------|--------|
| 1 | Conversation-Aware Context | Medium | High |
| 2 | Data Profile Awareness | Medium | High |
| 3 | Smart Query Repair | Low | Medium |
| 4 | Visualization Intelligence | Low | Medium |
| 5 | Semantic Intent Classifier | High | High |
| 6 | Proactive Disambiguation | Medium | Medium |
| 7 | Knowledge Graph Integration | High | Medium |

---

## Quick Wins (Implement Today)

1. **Add conversation history to system prompt** (5 lines of code)
2. **Include cardinality hints in schema presentation** (1 query per table)
3. **Add query error explanation in failure responses** (wrap existing error)
4. **Include "last used table" in follow-up detection** (check chat history)

---

## Conclusion

The current system is well-architected but operates in a mostly "stateless" manner. The biggest gains will come from:

1. **Remembering context** across conversation turns
2. **Understanding data shape** before querying
3. **Graceful error recovery** instead of raw failures

Would you like me to implement any of these improvements?
