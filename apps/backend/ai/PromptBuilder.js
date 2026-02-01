export class PromptBuilder {
  static buildQueryPrompt(context, settings = {}) {
    const { dialect, schema } = context
    const { customInstructions, aiDetail } = settings

    // Detail level instruction
    let detailInstruction = ''
    if (aiDetail === 0) {
      detailInstruction = '\nQUERY STYLE: Generate the most efficient and concise query possible. Avoid unnecessary columns.'
    } else if (aiDetail === 2) {
      detailInstruction = '\nQUERY STYLE: Ensure the query is comprehensive. Select all relevant columns to provide a complete picture.'
    }

    // Build sections
    const contextHierarchy = this.buildContextHierarchy()
    const dataSourceStrategy = this.buildDataSourceStrategy(schema)
    const universalPrinciples = this.buildUniversalQueryPrinciples()
    const { schemaPresentation, dialectInstructions } = this.buildDialectInstructions(dialect, schema, settings)
    const executionRules = this.buildExecutionRules()

    // Knowledge Base
    let knowledgeBaseContext = ''
    if (schema?.semanticContext?.knowledgeBase) {
      const kb = schema.semanticContext.knowledgeBase
      knowledgeBaseContext = `\nKNOWLEDGE BASE (Your PRIMARY reference for context):\n`
      knowledgeBaseContext += `This contains facts about the system, data mappings, and documentation.\nALWAYS check here FIRST before making assumptions.\n\n`
      kb.forEach((item, i) => {
        knowledgeBaseContext += `[Source ${i + 1}: ${item.source}${item.tableName ? ` table ${item.tableName}` : ''}]\n${item.content}\n\n`
      })
      knowledgeBaseContext += `GROUNDING RULES:\n1. If KB contains relevant info, treat it as source of truth\n2. ALWAYS cite sources using [Source X] format\n3. If answer not in KB or schema, state "I cannot find this information in the available sources after checking [list sources checked]"\n4. NEVER hallucinate - if you don't know, say so explicitly\n`
    }

    // Semantic Context
    let semanticContext = ''
    if (schema?.semanticContext) {
      const sc = schema.semanticContext
      if (sc.domain || (sc.columns?.length > 0)) {
        semanticContext += `\nSEMANTIC MAPPINGS (Use to resolve field ambiguity):\n`
        if (sc.domain) semanticContext += `Domain: ${sc.domain.domain || 'N/A'}\n`
        if (sc.columns) {
          sc.columns.forEach(col => {
            semanticContext += `  - "${col.column_name}"`
            if (col.semantic_name) semanticContext += ` means "${col.semantic_name}"`
            if (col.description) semanticContext += ` (${col.description})`
            semanticContext += `\n`
          })
        }
      }
    }

    // Source Insights
    let sourceInsightsContext = ''
    if (schema?.semanticContext?.sourceInsights && Object.keys(schema.semanticContext.sourceInsights).length > 0) {
      sourceInsightsContext = `\nSOURCE OBSERVATIONS (Persistent AI Memory):\n`
      sourceInsightsContext += `The following facts were discovered during previous analysis of your data sources:\n`
      Object.entries(schema.semanticContext.sourceInsights).forEach(([table, insights]) => {
        if (insights && insights.length > 0) {
          sourceInsightsContext += `Table: ${table}\n`
          insights.forEach(ins => {
            sourceInsightsContext += `  - [${ins.category}] ${ins.insight} (Confidence: ${ins.confidence})\n`
          })
        }
      })
    }

    const languageInstruction = settings.language ? `\nRESPONSE LANGUAGE: ${settings.language}` : ''

    return `
You are an expert ${dialect} database engineer. Return only the query/JSON without conversational filler.

${contextHierarchy}

${dataSourceStrategy}

${knowledgeBaseContext}

${schemaPresentation}

${sourceInsightsContext}



${schema?.semanticContext?.samples ? `
DATA SAMPLES (Crucial for generic headers):
${Object.entries(schema.semanticContext.samples).map(([table, rows]) => `Table: ${table}\n${JSON.stringify(rows.slice(0, 3), null, 2)}`).join('\n\n')}
` : ''}

${universalPrinciples}

${dialectInstructions}

${executionRules}
${detailInstruction}
${languageInstruction}
${customInstructions ? `\nUSER INSTRUCTIONS: ${customInstructions}` : ''}
`.trim()
  }

  static buildContextHierarchy() {
    return `
CONTEXT HIERARCHY (Always check in this order):
1. KNOWLEDGE BASE - Domain facts, data mappings, documentation, definitions
2. SCHEMA - Available tables/collections, column names, data types
3. SAMPLE VALUES - Example data for fuzzy matching and understanding content
4. QUERY RESULTS - Actual data fetched via query_data tool

When answering questions:
- First check if Knowledge Base explains the term/concept
- Then identify which schema objects (tables/collections) are relevant
- Use samples to understand data patterns and for fuzzy matching
- Finally execute queries to get actual data
`.trim()
  }

  static buildDataSourceStrategy(schema) {
    const tables = schema.tables || schema.collections || []
    const registry = schema.sourceRegistry || {}

    let strategy = `
SOURCE ORCHESTRATION ENGINE:
You have access to the following data sources. Use the query_data tool on LOADED sources.

LOADED & READY (Use These Directly):
${tables.map(t => `- ${t} (${registry[t]?.provider || 'default'})`).join('\n')}

FULL REGISTRY (For Reference):
${Object.entries(registry).map(([name, meta]) => `- ${name} | Origin: ${meta.origin} | Type: ${meta.type} | Dialect: ${meta.provider || 'default'}`).join('\n')}

ROUTING RULES:
1. QUANTITATIVE (How much, total, sum, growth) → Focus on STRUCTURED/SEMI_STRUCTURED sources. Use the query_data tool.
2. QUALITATIVE (What is the strategy, recommended, notes) → Focus on UNSTRUCTURED sources. Reference the provided content summaries.
3. CROSS-SOURCE JOINS (e.g. "Do my holdings match research picks?"):
   - Step A: Query STRUCTURED to get identifiers (e.g. Fund Names).
   - Step B: Search UNSTRUCTURED for those exact identifiers to extract facts.
   - Step C: Synthesize by joining identifier-to-fact.

STRICT ANCHORING & NAMING:
- USE REGISTRY NAMES: You MUST use the exact name from the "REGISTRY" list above (e.g. if the registry says 'funds_2023', do NOT use 'funds' or 'Funds').
- MAPPING: If a user mentions a file by its visual name (e.g. "my portfolio"), look for the most similar entry in the REGISTRY (e.g. 'portfolio_report') and use that name in your tool call.
- NEVER use training data/general knowledge for sources listed above. 
- CITE ORIGINS: Use [Source: OriginName] for every primary fact.
`

    return strategy.trim()
  }

  static buildUniversalQueryPrinciples() {
    return `
UNIVERSAL QUERY PRINCIPLES:

1. DATA DISCOVERY:
- Use sample values to understand categorical fields.
- For tables with generic headers ("Field 1", "column_0"), check the "SOURCE OBSERVATIONS" and "DATA SAMPLES" sections above FIRST.
- If observations already explain the column mappings, use them immediately.
- If samples/observations are missing, you MUST call 'get_sample_data' (limit 10) to identify the correct columns.
- Scan for strings like "Amount", "Fund", "Market Value" to identify the real column indices (often Row 5+ in spreadsheets).
- Once you identify the header row, use the Field indices from that row (e.g. Field4 => 'Invested Amount') for all subsequent queries.

2. COLUMN SELECTION (CRITICAL):
When the user asks for specific data, you MUST find the EXACT matching columns using these rules:

SEMANTIC MATCHING - Recognize these common synonyms:
- "Invested Amount" = "Cost" = "Principal" = "Investment" = "Amount Invested"
- "Market Value" = "Value" = "Current Value" = "NAV Value" = "Present Value"
- "Fund Name" = "Scheme Name" = "Fund" = "Scheme" = "Name"
- "Gain/Loss" = "Profit/Loss" = "Returns" = "P&L" = "Gain" = "Loss"
- "Units" = "Quantity" = "Holdings" = "No. of Units"

SELECTION RULES:
✓ ONLY select columns that are explicitly requested or clearly needed for the query
✓ For comparisons (X vs Y), select EXACTLY those two columns plus a label column
✓ Do NOT select ALL columns with SELECT * - be specific
✓ If user says "Invested Amount vs Market Value", select: [label_column, invested_column, value_column] ONLY
✓ Exclude date columns unless specifically requested for time-series analysis

OUTPUT FORMAT:
- For bar/line charts: SELECT category_label, metric1, metric2 FROM table
- For aggregations: SELECT category, SUM(metric) FROM table GROUP BY category
- NEVER include internal IDs, row numbers, or metadata columns in visualization queries

3. AMBIGUITY:
- If a term matches multiple sources, query BOTH and compare.
- If intent is unclear, use the "ambiguous" response format.

4. "HOW MANY" QUESTIONS:
- Return the actual records (LIMIT 100) by default so the user can see exactly what was counted.
- Only use COUNT() if explicitly requested.

5. LEARNING & PERSISTENCE:
- When you discover a high-confidence fact about a source (e.g. "Row 5 is the header row", "Field4 is 'Invested Amount'"), you SHOULD call 'record_data_insight'.
- This persists the knowledge across sessions, making subsequent queries faster and more professional.
- Use the 'mapping' category for column/row definitions.

6. RESPONSE TYPE COMMANDS:
- If NO slash command is used: Default to a TEXT response and analysis. Use tools to fetch data, but focus on explaining the findings conversationally.
- If a user starts with /visualization, /chart, or /plot: They EXPLICITLY want a visual chart. Prioritize aggregates and groupings.
- If a user starts with /query: They ONLY want the SQL query code. DO NOT call 'query_data' or 'execute_query'. Instead, use your knowledge of the schema to write the SQL and return it in a markdown code block.
- If a user starts with /text: They want a textual explanation only. Avoid calling visualization tools or requesting charts.
`.trim()
  }

  static buildExecutionRules() {
    return `
QUERY EXECUTION RULES:

STEP 0 - DISCOVERY & INSPECTION (MANDATORY):
✓ Check if headers are generic ("Field1", "column_0", etc.).
✓ If generic, you MUST call 'get_sample_data' (limit 10) to identify real column meanings BEFORE giving up or erroring.
✓ Scan for metrics like "Amount", "Value", or category names in the samples to map them to Field indices.

STEP 1 - ANALYZE THE REGISTRY:
✓ Identify STRUCTURED vs UNSTRUCTURED sources.
✓ Note the ORIGIN of each source.

STEP 2 - CROSS-SOURCE ORCHESTRATION:
✓ For "Show me" or "Calculations" $\rightarrow$ Use query_data on Structured sources.
✓ For "Why", "How", or "Strategy" $\rightarrow$ Reference Unstructured sources.

STEP 3 - VERIFY AND CITE:
✓ ALWAYS cite the origin: [Source: OriginName].
✓ If no matches found, explicitly list exactly what you checked and why you couldn't find it.
`.trim()
  }

  static buildDialectInstructions(dialect, schema, settings) {
    let formatInstructions = ''
    let schemaPresentation = ''
    const activeTable = settings.activeTable || schema.activeTable

    if (dialect === 'mongodb') {
      const collections = schema.collections || schema.tables || []
      const samples = schema.samples || {}
      const sampleValues = schema.sampleValues || {}
      const totalCollections = schema.totalCollections || collections.length
      const filtered = schema.filtered || false

      if (schema.detailedSchema) {
        schemaPresentation = `\nDatabase Schema:\n`
        Object.entries(schema.detailedSchema).forEach(([coll, fields]) => {
          schemaPresentation += `Collection: ${coll}\n`
          schemaPresentation += `Inferred Fields:\n`
          fields.forEach(f => {
            schemaPresentation += `  - ${f.name} (${f.type})\n`
          })
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation = `\nAvailable Collections${filtered ? ` (showing ${collections.length} of ${totalCollections} total, filtered by relevance)` : ` (${collections.length} total)`}:\n`
        collections.forEach(coll => {
          schemaPresentation += `- ${coll}`
          if (samples[coll]) {
            schemaPresentation += ` (fields: ${samples[coll].join(', ')})`
          }
          schemaPresentation += '\n'
        })
      }

      if (Object.keys(sampleValues).length > 0) {
        const values = Object.entries(sampleValues)
          .map(([coll, fields]) => {
            return Object.entries(fields)
              .map(([key, vals]) => `${coll}.${key}: [${vals.join(', ')}]`)
              .join('\n')
          })
          .join('\n')
        if (values) {
          schemaPresentation += `\nSample Values:\n${values}`
        }
      }

      formatInstructions = `
MONGODB QUERY FORMAT:
You are a MongoDB query generator. Return ONLY valid JSON - no markdown code blocks.

OUTPUT SCHEMA:
{
  "reasoning": "Step-by-step explanation of how the query was constructed",
  "collection": "collection_name", // MUST be one of the available collections
  "filter": { ... }, // MongoDB query filter ($eq, $gt, $in, $and, $or, $regex)
  "limit": 10 // Optional limit, default 100
}

OR for EDIT/MODIFY/DELETE operations:
{
  "action": "edit",
  "method": "update|insert|delete",
  "reasoning": "Why this action is being taken",
  "confirmation": "Human readable confirmation message",
  "example_formula": "e.g., Price * 1.1 = New Price",
  "query": { ...MongoDB update/insert/delete spec... }
}

OR if ambiguous:
{
  "ambiguous": true,
  "message": "Explanation of ambiguity",
  "choices": ["Option 1", "Option 2"]
}

NESTED FIELDS:
- Use dot notation: "player1.clubName", "player2.name"
- Partial text matches: {"field": {"$regex": "pattern", "$options": "i"}}
- Multiple nested fields: Use $or operator
Example: {"$or": [{"player1.clubName": {"$regex": "New Mexico", "$options": "i"}}, {"player2.clubName": {"$regex": "New Mexico", "$options": "i"}}]}

EXAMPLES:
1. Simple query:
   {"reasoning": "User wants active users", "collection": "users", "filter": {"status": "active"}, "limit": 10}

2. Nested field search:
   {"reasoning": "Searching for teams from New Mexico", "collection": "teams", "filter": {"$or": [{"player1.clubName": {"$regex": "New Mexico", "$options": "i"}}, {"player2.clubName": {"$regex": "New Mexico", "$options": "i"}}]}}
`
    } else if (dialect === 'mysql' || dialect === 'sqlite' || dialect === 'postgres' || dialect === 'duckdb') {
      // SQL Dialects
      const tables = schema.tables || []
      const sampleValues = schema.sampleValues || {}

      schemaPresentation = `\nDatabase Schema:\n`
      if (schema.detailedSchema) {
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
          const desc = schema.tableDescriptions?.[table] ? ` (${schema.tableDescriptions[table]})` : ''
          if (table === activeTable || tables.length <= 10) {
            schemaPresentation += `Table: ${table}${desc}\nColumns:\n`
            columns.forEach(col => {
              schemaPresentation += `  - ${col.name} (${col.type})${col.pk ? ' [PK]' : ''}\n`
            })
          } else {
            schemaPresentation += `Table: ${table}${desc} (Details available via get_table_schema tool)\n`
          }
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation += `Available Tables:\n${tables.map(t => {
          const desc = schema.tableDescriptions?.[t] ? ` (${schema.tableDescriptions[t]})` : ''
          return `- ${t}${desc}`
        }).join('\n')}`
      }

      if (Object.keys(sampleValues).length > 0) {
        schemaPresentation += '\n\nSample Values (categorical fields):\n'
        Object.entries(sampleValues).forEach(([table, fields]) => {
          if (table === activeTable || tables.length <= 3) {
            schemaPresentation += `  ${table}:\n`
            Object.entries(fields).slice(0, 5).forEach(([field, values]) => {
              schemaPresentation += `    - ${field}: [${values.join(', ')}]\n`
            })
          }
        })
      }

      formatInstructions = `
SQL DIALECT - DATA ACCESS RULES:
You are a Data Architect. You utilize a tool called 'query_data' to fetch or analyze data.

CRITICAL RULES:
1. **DO NOT WRITE SQL DIRECTLY.** You must use the \`query_data\` tool.
2. The \`query_data\` tool takes a structured JSON object (Intent) describing what you want.
3. The system will compile your intent into optimized, secure SQL.

INTENT STRUCTURE:
{
  "resource": "table_name", // The table to query
  "filters": [ // Optional conditions
    {"field": "column_name", "op": "=|>|<|>=|<=|LIKE|IN", "value": "..."}
  ],
  "groupBy": ["column1", "column2"], // Optional grouping
  "aggregations": [ // Optional aggregations
    {"op": "count|sum|avg|min|max", "field": "column_name", "alias": "result_name"}
  ],
  "orderBy": [ // Optional sorting
    {"field": "column_name", "direction": "asc|desc"}
  ],
  "limit": 100 // Default limit
}

HOW TO SELECT DATA:
- If headers are generic (Field1, Field2), utilize the DATA SAMPLES provided above to map columns.
- For "What is", "Tell me", "List", "Show me", "Compare" → Just use query_data to fetch the facts.
- The system will automatically analyze your results to determine if a visualization (chart) is appropriate.
- **Overplotting**: When creating a chart, ALWAYS consider if you need a \`groupBy\` and \`aggregations\` (SUM/AVG) to avoid too many raw points.

HOW TO ANSWER QUERIES:
- "Show me X" → {resource: "table_name", limit: 100}
- "Filter by Y" → {resource: "table_name", filters: [{field: "col", op: "=", value: "Y"}], limit: 100}
- "Group by category" → {resource: "table_name", groupBy: ["category"], aggregations: [{op: "count", field: "*"}]}
- "Top 10 by price" → {resource: "table_name", orderBy: [{field: "price", direction: "desc"}], limit: 10}

MULTI-SOURCE QUERIES:
Return an ARRAY of intents to fetch from multiple tables:
[
  {resource: "table1", filters: [...], limit: 100},
  {resource: "table2", filters: [...], limit: 100}
]

Example: "Compare portfolio performance to market benchmarks"
[
  {resource: "portfolio_summary", limit: 100},
  {resource: "market_indices", limit: 100}
]

VISUALIZATION:
- ONLY include "visualization" field if user explicitly asks for "chart", "graph", "plot"
- For "What is", "Tell me", "List", "Show me" → NO visualization field
- The system will show data as a table by default

COMPLEX QUERIES ("Best and Worst", "Compare X and Y"):
Use multiple intents:
Example: "Least and most expensive funds"
[
  {resource: "funds", orderBy: [{field: "price", direction: "asc"}], limit: 5},
  {resource: "funds", orderBy: [{field: "price", direction: "desc"}], limit: 5}
]
`
    } else if (dialect === 'surrealdb') {
      if (schema.detailedSchema) {
        schemaPresentation = `\nDatabase Schema:\n`
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
          schemaPresentation += `Table: ${table}\n`
          schemaPresentation += `Columns:\n`
          columns.forEach(col => {
            schemaPresentation += `  - ${col.name} (${col.type})\n`
          })
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation = `\nAvailable Tables:\n${(schema.tables || []).map(t => `- ${t}`).join('\n')}`
      }

      if (schema.sampleValues && Object.keys(schema.sampleValues).length > 0) {
        schemaPresentation += '\n\nSample Values (USE THESE EXACT VALUES in your queries):\n'
        Object.entries(schema.sampleValues).forEach(([table, fields]) => {
          schemaPresentation += `  ${table}:\n`
          Object.entries(fields).forEach(([field, values]) => {
            schemaPresentation += `    - ${field}: [${values.join(', ')}]\n`
          })
        })
      }

      formatInstructions = `
SURREALDB QUERY GENERATOR:
SurrealQL is similar to SQL but has important differences.

RESPONSE FORMAT:
- For simple SELECT queries: Return just the query string
- For ambiguous requests: Return JSON with "ambiguous": true, "message": "...", "choices": [...]
- For EDIT/MODIFY/DELETE (MUTATIONS):
{
  "action": "edit",
  "method": "update|insert|delete",
  "reasoning": "Increasing TechCorp inventory prices per user request",
  "confirmation": "I will increase the price of all TechCorp products by 10%",
  "example_formula": "Price * 1.1 = New Price",
  "query": "UPDATE inventory SET Price = Price * 1.1 WHERE Supplier = 'TechCorp'"
}

SURREALQL SYNTAX GUIDE:

1. BASIC QUERIES:
   SELECT * FROM table_name LIMIT 100
   SELECT column1, column2 FROM table_name WHERE condition LIMIT 100
   SELECT * FROM table_name ORDER BY column DESC LIMIT 100

2. FILTERING:
   WHERE column = 'value'
   WHERE column > 100
   WHERE column IN ['a', 'b', 'c']
   WHERE string::lowercase(column) CONTAINS 'search' // case-insensitive search

3. GROUPING & COUNTING:
   SELECT Supplier, count() FROM table_name GROUP BY Supplier
   // Returns: [{Supplier: "X", count: 5}, {Supplier: "Y", count: 3}]
   
   // For TOTAL count across all records:
   SELECT count() FROM table_name GROUP ALL
   // Returns: [{count: 10}]

4. AGGREGATIONS (use RETURN for sum/avg/min/max):
   RETURN math::sum((SELECT VALUE type::number(Stock) FROM table_name))
   RETURN math::mean((SELECT VALUE type::number(Price) FROM table_name))

5. DISTINCT VALUES:
   SELECT column FROM table_name GROUP BY column

WHAT DOES NOT WORK (NEVER use these - they will cause errors):
- SELECT DISTINCT column (use GROUP BY instead)
- SUM(column), AVG(column) in SELECT clause
- array::sum - THIS DOES NOT EXIST
- array::group - THIS DOES NOT EXIST
- $variable placeholders
- AS aliases like "count() as Total"
- Any aggregate function in SELECT except count()

CRITICAL - BACKTICKS FOR SPECIAL COLUMN NAMES:
If column names contain spaces, slashes, or special characters, enclose them in backticks:
CORRECT: SELECT \`Fund Name\`, \`Gain/Loss\`, \`1 Year Return (%)\` FROM table
WRONG: SELECT Fund Name, Gain/Loss FROM table (WILL FAIL!)

FOR SUM/AVG BY GROUP:
SurrealDB cannot do SUM by group in a single query. For "total stock by supplier":
- Return ALL rows with the grouping column and numeric column
- Example: SELECT Supplier, Stock FROM inventory LIMIT 100
- The frontend will aggregate the data automatically
- DO NOT try to use math::sum with GROUP BY
- DO NOT return multi-step queries

EXAMPLES:

User: "Show me all products"
Response: SELECT * FROM inventory LIMIT 100

User: "How many items per supplier?"
Response: SELECT Supplier, count() FROM inventory GROUP BY Supplier

User: "What's the total stock?"
Response: RETURN math::sum((SELECT VALUE type::number(Stock) FROM inventory))

User: "Show me products from TechCorp"
Response: SELECT * FROM inventory WHERE Supplier = 'TechCorp' LIMIT 100

User: "Top 5 funds by return"
Response: SELECT \`Fund Name\`, \`Ret.(%)\` FROM funds ORDER BY \`Ret.(%)\` DESC LIMIT 5
`
    } else if (dialect === 'kusto') {
      if (schema.detailedSchema) {
        schemaPresentation = `\nDatabase Schema:\n`
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
          schemaPresentation += `Table: ${table}\n`
          schemaPresentation += `Columns:\n`
          columns.forEach(col => {
            schemaPresentation += `  - ${col.name} (${col.type})\n`
          })
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation = `\nAvailable Tables:\n${(schema.tables || []).map(t => `- ${t}`).join('\n')}`
      }

      formatInstructions = `
KUSTO (KQL) QUERY FORMAT:
Return valid KQL syntax for Azure Data Explorer / Kusto.

QUERY RULES:
- For data queries, ALWAYS start with table name: TableName | where ...
- For management commands (creating tables/data), use Control Commands starting with dot (.)
- NEVER start a query with a pipe (|). Always start with the table name.

CRITICAL RULE FOR CREATING DATA:
- DO NOT use \`.ingest inline\`. It is not supported.
- ALWAYS use \`.set-or-append\` with \`datatable\` to create and populate tables in one step.
- This is the ONLY way to insert dummy/test data.

EXAMPLES:

1. Query Data:
   TableName | where Status == "active" | take 10
   TableName | where Age > 25 | project Name, Age, City
   TableName | summarize Count=count() by Category

2. Create Table & Insert Data (The CORRECT Way):
   .set-or-append Users <| 
   datatable(Name:string, Age:int) [
     "Alice", 30,
     "Bob", 25,
     "Charlie", 35
   ]

3. Create Empty Table Only:
   .create table Users (Name:string, Age:int, Email:string)

4. Complex Query:
   Sales 
   | where Timestamp > ago(7d) 
   | summarize TotalRevenue=sum(Amount) by Product 
   | order by TotalRevenue desc 
   | take 10
`
    }

    return { schemaPresentation, dialectInstructions: formatInstructions }
  }

  static buildAnalysisPrompt(question, results, query, semanticContext = {}) {
    let kbContent = ''
    if (semanticContext.knowledgeBase?.length > 0) {
      kbContent = `\n[KNOWLEDGE BASE - PRIORITIZE OVER TRAINING DATA]\n`
      semanticContext.knowledgeBase.forEach((item, i) => {
        kbContent += `[Source ${i + 1}: ${item.source}]\n${item.content}\n\n`
      })
      kbContent += `GROUNDING RULES:\n1. Use these sources as the definitive truth for strategy and recommendations.\n2. CITE your sources using [Source X].\n`
    }

    return `
You are a helpful data analyst assistant. 
Analyze the following database results to answer the user's question with deep insights.

${kbContent}

Query Executed: ${query}

Results:
${Array.isArray(results) ? JSON.stringify(results.slice(0, 50), null, 2) : JSON.stringify(results, null, 2)}
${Array.isArray(results) && results.length > 50 ? '(Note: Only the first 50 rows are shown)' : ''}

User Question: ${question}

Provide a natural language summary that directly answers the user's question.

CRITICAL: You MUST return a valid JSON object.

Response Format:
{
  "answer": "Your detailed response here...",
  "prediction": {
    "value": "The predicted value (if applicable)",
    "confidence": 0.85,
    "reasoning": "Step-by-step logic for this prediction"
  }
}

Rules for "answer":
1. Length: At least 1 paragraph, maximum 5 paragraphs.
2. **FORMATTING**: Use Markdown extensively. Use \`**bold**\` for key names or values.
3. **SPACING**: Use double newlines (\`\\n\\n\`) between paragraphs or sections to ensure it's not cramped.
4. **SCANNABILITY**: Use bullet points (\`* \` or \`- \`) or numbered lists for lists of items.
5. **DATA**: If results are numerical, include statistical context (averages, totals, min/max).
6. **INSIGHTS**: Identify patterns, trends, or notable outliers and highlight them.
7. Format numbers with appropriate units (e.g., $120,000, 5 employees).

Rules for "prediction" (Only include if user asks to predict/forecast):
1. Use current data points to extrapolate.
2. Provide a confidence score from 0.0 to 1.0.
3. Explain the reasoning clearly.

Example response:
{
  "answer": "Based on the sales data, there is a strong upward trend in Q3. Total revenue reached $450k, a 15% increase from Q2. Most of this growth comes from the 'Electronics' category which accounted for 60% of sales.\\n\\nNotable patterns:\\n• Sales peak on weekends\\n• Customer retention is at 82%\\n• Average order value grew by $12."
}
    `.trim()
  }

  static buildDisambiguationPrompt(term, candidates) {
    return `
The user is searching for "${term}" in a database.
Here are the candidate tables/columns found:
${JSON.stringify(candidates, null, 2)}

Which of these are the most relevant?
Return a JSON array of the top matches (max 8).
If none are relevant, return an empty array.

Output format: ["match1", "match2"]
    `.trim()
  }

  static buildTitlePrompt(messages) {
    // Focus on the first few messages which establish the topic
    const recentMessages = messages.slice(0, 4)
    const conversationText = recentMessages.map(m => `${m.role}: ${m.content?.substring(0, 300) || ''}`).join('\n')

    // Check for common patterns to guide title generation
    const content = conversationText.toLowerCase()
    const hasQueryKeywords = content.match(/select|from|where|sum|count|average|group by|join|table|database|query/)
    const hasDataAnalysis = content.match(/analyze|analysis|compare|trend|chart|graph|visualize|report/)
    const hasFinance = content.match(/portfolio|stocks|funds|investment|price|value|gain|loss|return/)

    let guidance = ''
    if (hasQueryKeywords) {
      guidance = '\nThis is a DATABASE QUERY. Title should describe the data: "Sales Summary", "User Activity", "Inventory Check".'
    } else if (hasDataAnalysis) {
      guidance = '\nThis is DATA ANALYSIS. Title should describe the insight: "Revenue Trends", "Performance Comparison", "Growth Analysis".'
    } else if (hasFinance) {
      guidance = '\nThis is FINANCE related. Title should be specific: "Portfolio Review", "Fund Performance", "Investment Returns".'
    }

    return `
Generate a SHORT, DESCRIPTIVE title (2-5 words) for this chat based on the user's intent.

RULES:
- Be specific, not generic (BAD: "Data Query", GOOD: "Sales by Region")
- Use nouns and action words (BAD: "Help with data", GOOD: "Revenue Analysis")
- No quotes, no "Title:", just the text
- If about a specific table/file, include its name
${guidance}

Messages:
${conversationText}

Title:`.trim()
  }

  static cleanResponse(response, dialect) {
    try {
      if (!response || typeof response !== 'string') return ''

      // 1. Remove markdown code blocks
      let clean = response.replace(/```(sql|surrealql|kusto|mongo|json)?\s*/g, '').replace(/```/g, '').trim()

      // 2. If dialect is mongodb, try to extract just the JSON object
      if (dialect === 'mongodb') {
        const jsonMatch = clean.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          clean = jsonMatch[0]
        }
      }

      // 3. SurrealDB-specific cleanup
      if (dialect === 'surrealdb') {
        // Remove trailing semicolons
        clean = clean.replace(/;\s*$/, '')

        // Fix double closing parentheses at end - common AI mistake
        while (clean.endsWith('))')) {
          const openCount = (clean.match(/\(/g) || []).length
          const closeCount = (clean.match(/\)/g) || []).length
          if (closeCount > openCount) {
            clean = clean.slice(0, -1)
          } else {
            break
          }
        }

        // Remove any trailing garbage characters after final paren
        clean = clean.replace(/\)\s*[^)\s]+$/, ')')
      }

      // 4. Check for JSON (ambiguous response) even in SQL dialects
      if (clean.startsWith('{') && clean.endsWith('}')) {
        return clean
      }

      return clean
    } catch (e) {
      console.warn("Error cleaning up AI response:", e)
      return typeof response === 'string' ? response.trim() : ''
    }
  }

  static formatHistory(previousContext) {
    return (previousContext || [])
      .filter(msg => msg.content)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
  }
}