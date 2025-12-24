export class PromptBuilder {
  static buildQueryPrompt(context, settings = {}) {
    const { dialect, schema } = context
    const { customInstructions, aiDetail } = settings

    // Database-specific format instructions
    let formatInstructions = ''
    let schemaPresentation = ''

    if (dialect === 'mongodb') {
      // Extract collections list
      const collections = schema.collections || schema.tables || []
      const samples = schema.samples || {}
      const sampleValues = schema.sampleValues || {}
      const totalCollections = schema.totalCollections || collections.length
      const filtered = schema.filtered || false

      // Build a clear schema presentation
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

      // Add sample values if available
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
CRITICAL - MongoDB Query Format Rules:
You are a MongoDB query generator. You MUST return a valid JSON object.
Do NOT wrap the output in markdown code blocks (like \`\`\`json). Just return the raw JSON.

Output Schema:
{
  "reasoning": "Step-by-step explanation of how the query was constructed...",
  "collection": "collection_name", // MUST be one of the available collections
  "filter": { ... }, // MongoDB query filter (e.g. $eq, $gt, $in, $and, $or, $regex)
  "limit": 10 // Optional limit, default 100
}

OR if ambiguous:
{
  "ambiguous": true,
  "message": "Explanation of ambiguity...",
  "choices": ["Option 1", "Option 2"]
}

"HOW MANY" QUESTIONS:
When users ask "how many X", they typically want to see the actual documents, not just a count.
- Return the matching documents with a filter and limit
- Do NOT use aggregation pipeline with $count
- Only use count if the user explicitly asks for "just the count" or "only the number"
- The count is implied by the number of documents returned

IMPORTANT RULES FOR NESTED FIELDS:
- To search in nested objects, use dot notation: "player1.clubName", "player2.name"
- For partial text matches (like searching for "New Mexico" in club names), use $regex with case-insensitive flag
- Example: {"player1.clubName": {"$regex": "New Mexico", "$options": "i"}}
- To search across multiple nested fields, use $or operator

EXAMPLES:
1. Simple query:
   {"reasoning": "User wants active users. Found 'users' collection with 'status' field.", "collection": "users", "filter": {"status": "active"}, "limit": 10}

2. Nested field search with regex:
   {"reasoning": "Searching for teams from New Mexico. Using $or to check both player1 and player2 clubName fields with regex.", "collection": "teams", "filter": {"$or": [{"player1.clubName": {"$regex": "New Mexico", "$options": "i"}}, {"player2.clubName": {"$regex": "New Mexico", "$options": "i"}}]}}

3. "How many" question:
   User: "How many employees are from California?"
   {"reasoning": "Finding all employees from California. Using $in to match West Coast cities.", "collection": "employees", "filter": {"city": {"$in": ["Los Angeles", "San Francisco", "San Diego", "Sacramento"]}}, "limit": 100}
`
    } else if (dialect === 'mysql' || dialect === 'sqlite' || dialect === 'postgres') {
      // SQL Dialects
      const tables = schema.tables || []
      const sampleValues = schema.sampleValues || {}

      if (schema.detailedSchema) {
        schemaPresentation = `\nDatabase Schema:\n`
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
          schemaPresentation += `Table: ${table}\n`
          schemaPresentation += `Columns:\n`
          columns.forEach(col => {
            schemaPresentation += `  - ${col.name} (${col.type})${col.pk ? ' [PK]' : ''}\n`
          })
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation = `\nAvailable Tables:\n${tables.map(t => `- ${t}`).join('\n')}`
      }

      // Add sample values if available
      if (Object.keys(sampleValues).length > 0) {
        schemaPresentation += '\n\nSample Values:\n'
        Object.entries(sampleValues).forEach(([table, fields]) => {
          schemaPresentation += `  ${table}:\n`
          Object.entries(fields).forEach(([field, values]) => {
            schemaPresentation += `    - ${field}: [${values.join(', ')}]\n`
          })
        })
      }


      // Add Semantic Context if available
      if (context.semanticContext) {
        const sc = context.semanticContext;
        if (sc.domain || (sc.columns && sc.columns.length > 0)) {
          schemaPresentation += `\n\nSEMANTIC UNDERSTANDING (Use this to resolve ambiguity):\n`;
          if (sc.domain) {
            schemaPresentation += `Domain: ${sc.domain.domain || 'N/A'}\n`;
          }
          if (sc.columns && sc.columns.length > 0) {
            schemaPresentation += `Column Semantics:\n`;
            sc.columns.forEach(col => {
              schemaPresentation += `  - "${col.column_name}"`;
              if (col.semantic_name) schemaPresentation += ` means "${col.semantic_name}"`;
              if (col.description) schemaPresentation += ` (${col.description})`;
              schemaPresentation += `\n`;
            });
          }
        }
      }

      formatInstructions = `
IMPORTANT - ${dialect.toUpperCase()} Query Format:
You can return a single SQL query OR a JSON object for complex requests.

JSON Format for COMPLEX/MULTI-PART QUESTIONS:
{
  "multi_step": true,
  "steps": [
    { "query": "SELECT ...", "explanation": "First, we get..." },
    { "query": "SELECT ...", "explanation": "Then, we calculate..." }
  ]
}

OR if ambiguous:
{
  "ambiguous": true,
  "message": "...",
  "choices": [...]
}

Normal Single Query:
Just return the SQL (e.g., SELECT * FROM ...)

RULES:
1. Return valid ${dialect} SQL syntax only
2. Use appropriate quoting for table/column names if they contain special characters
3. For partial text matches, use LIKE with wildcards: WHERE column LIKE '%search%'
4. **CRITICAL**: For company/supplier/vendor/manufacturer names, ALWAYS use LIKE '%name%' instead of exact equality (=)
5. Always include a LIMIT clause (default 100)
6. When selecting data, include primary keys or identifying columns
7. JOINs are encouraged if data is split across tables
8. CRITICAL: DO NOT include simulated results (e.g. "Results: [...]") or explanations after the query

"HOW MANY" QUESTIONS:
When users ask "how many X", they typically want to see the actual data, not just a count.
- Use: SELECT * FROM table WHERE ... LIMIT 100
- NOT: SELECT COUNT(*) FROM table WHERE ...
- Only use COUNT(*) if the user explicitly asks for "just the count" or "only the number"
- The count is implied by the number of results returned

AMBIGUITY & JOINS:
1. If the request requires data from MULTIPLE tables (JOIN), you MUST verify that the join is logical.
2. USE SEMANTIC UNDERSTANDING: If a column name is not an exact match but is a strong semantic match based on the "Column Semantics" section (e.g. "Fund" user term matches "scheme_name" column), assumes it is correct.
3. Only return "ambiguous": true if there are MULTIPLE EQUALLY LIKELY conflicting candidates that cannot be resolved by context.
4. If the user asks for something that could be in multiple tables (e.g. "users" could mean "users" table or "admin_users" table), return "ambiguous": true.

AMBIGUOUS RESPONSE FORMAT (JSON):
{
  "ambiguous": true,
  "message": "Explanation of ambiguity...",
  "choices": ["Option 1", "Option 2"]
}

EXAMPLES:
1. Simple query:
   SELECT * FROM users WHERE status = 'active' LIMIT 10

2. Partial text match:
   SELECT * FROM teams WHERE team_name LIKE '%New Mexico%' LIMIT 100

3. JOIN query:
   SELECT u.id, u.name, o.order_id FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 'active' LIMIT 20

4. "How many" question:
   User: "How many employees are from California?"
   SELECT * FROM employees WHERE state = 'California' LIMIT 100
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

      // Add sample values if available (CRITICAL for accurate queries)
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
SURREALDB QUERY GENERATOR

You generate SurrealQL queries for SurrealDB. SurrealQL is similar to SQL but has important differences.

RESPONSE FORMAT:
- For simple queries: Return just the query string
- For ambiguous requests: Return JSON with "ambiguous": true, "message": "...", "choices": [...]

SURREALQL SYNTAX GUIDE:

1. BASIC QUERIES:
   SELECT * FROM table_name LIMIT 100
   SELECT column1, column2 FROM table_name WHERE condition LIMIT 100
   SELECT * FROM table_name ORDER BY column DESC LIMIT 100

2. FILTERING:
   WHERE column = 'value'
   WHERE column > 100
   WHERE column IN ['a', 'b', 'c']
   WHERE string::lowercase(column) CONTAINS 'search' (case-insensitive search)

3. GROUPING & COUNTING:
   SELECT Supplier, count() FROM table_name GROUP BY Supplier
   (Returns: [{Supplier: "X", count: 5}, {Supplier: "Y", count: 3}])

4. AGGREGATIONS (use RETURN for sum/avg/min/max):
   RETURN math::sum((SELECT VALUE type::number(Stock) FROM table_name))
   RETURN math::mean((SELECT VALUE type::number(Price) FROM table_name))

5. DISTINCT VALUES:
   SELECT column FROM table_name GROUP BY column

WHAT DOES NOT WORK (these will cause errors - NEVER use them):
- SELECT DISTINCT column (use GROUP BY instead)
- SUM(column), AVG(column) in SELECT clause
- array::sum - THIS DOES NOT EXIST
- array::group - THIS DOES NOT EXIST  
- ARRAY::GROUP - THIS DOES NOT EXIST
- $variable placeholders
- AS aliases like "count() as Total"
- Any aggregate function in SELECT except count()

FOR SUM/AVG BY GROUP:
SurrealDB cannot do SUM by group in a single query. For "total stock by supplier":
- Use count() instead: SELECT Supplier, count() FROM table GROUP BY Supplier
- This shows NUMBER OF ITEMS per supplier, which is usually what users want for pie charts

VISUALIZATION QUERIES:
When the user asks for a chart/visualization of grouped data:
- Use: SELECT category_column, count() FROM table GROUP BY category_column
- This returns data perfect for pie/bar charts: [{Category: "A", count: 10}, ...]
- Mark the response with chart hints if needed

EXAMPLES:

User: "Show me all products"
Response: SELECT * FROM inventory LIMIT 100

User: "How many items per supplier?"
Response: SELECT Supplier, count() FROM inventory GROUP BY Supplier

User: "What's the total stock?"
Response: RETURN math::sum((SELECT VALUE type::number(Stock) FROM inventory))

User: "Show me products from TechCorp"
Response: SELECT * FROM inventory WHERE Supplier = 'TechCorp' LIMIT 100

RULES:
1. Always include LIMIT unless doing aggregation
2. Use the exact table names from the schema
3. Match column names exactly (case-sensitive)
4. For partial text search, use: string::lowercase(col) CONTAINS 'term'
5. Return ONLY the query - no explanations, no simulated results

IMPORTANT - SUM BY GROUP:
SurrealDB cannot do SUM() with GROUP BY. For queries like "total stock by supplier":
- Return ALL rows with the grouping column and numeric column
- Example: SELECT Supplier, Stock FROM inventory LIMIT 100
- The frontend will aggregate the data automatically
- DO NOT try to use math::sum with GROUP BY
- DO NOT return multi-step queries for this

EXAMPLE:
User: "How much stock does each supplier provide?"
Response: SELECT Supplier, Stock FROM inventory LIMIT 100
(Frontend will group by Supplier and sum Stock values)
`
    } else if (dialect === 'kusto') {

      if (schema.detailedSchema) {
        schemaPresentation = `\nDatabase Schema: \n`
        Object.entries(schema.detailedSchema).forEach(([table, columns]) => {
          schemaPresentation += `Table: ${table} \n`
          schemaPresentation += `Columns: \n`
          columns.forEach(col => {
            schemaPresentation += `  - ${col.name} (${col.type}) \n`
          })
          schemaPresentation += '\n'
        })
      } else {
        schemaPresentation = `\nAvailable Tables: \n${(schema.tables || []).map(t => `- ${t}`).join('\n')} `
      }
      formatInstructions = `
IMPORTANT - Kusto(KQL) Query Format:
- Return valid KQL syntax.
- For data queries, start with table name: TableName | where ...
- For management(creating tables / data), use Control Commands starting with dot(.).
- NEVER start a query with a pipe(|).Always start with the table name.

CRITICAL RULE FOR CREATING DATA:
- DO NOT use \`.ingest inline\`. It is not supported.
- ALWAYS use \`.set-or-append\` with \`datatable\` to create and populate tables in one step.
- This is the ONLY way to insert dummy data.

EXAMPLES:
1. Query Data:
   TableName | where Status == "active" | take 10

2. Create Table & Insert Data (The CORRECT Way):
   .set-or-append Users <| 
   datatable(Name:string, Age:int) [
     "Alice", 30,
     "Bob", 25
   ]

3. Create Table Only:
   .create table Users (Name:string, Age:int)
`
    }

    let detailInstruction = ''
    if (aiDetail === 0) {
      detailInstruction = 'Generate the most efficient and concise query possible. Avoid unnecessary columns.'
    } else if (aiDetail === 2) {
      detailInstruction = 'Ensure the query is comprehensive. Select all relevant columns to provide a complete picture.'
    }

    const languageInstruction = settings.language ? `Respond in ${settings.language}.` : ''

    return `
You are an expert database engineer specializing in ${dialect} databases.
Your task is to convert the user's natural language request into a valid ${dialect} query.

${formatInstructions}
${schemaPresentation}

WORLD KNOWLEDGE & COMMON SENSE:
You have access to world knowledge and should use it to interpret queries intelligently:
- **Geography**: You know which cities are on the West Coast (Los Angeles, San Francisco, Seattle, Portland, San Diego, etc.), East Coast (New York, Boston, Miami, etc.), or in specific regions
- **Time & Dates**: You understand relative dates (last month, this year, Q1, etc.)
- **Common Categories**: You can infer categories (e.g., "tech companies" might include companies with names like "Google", "Microsoft", "Apple")
- **Industry Standards**: You understand common business terms, job titles, departments, etc.
- **Company/Supplier Names**: When users mention a company, supplier, vendor, or manufacturer name:
  - Look for fields like: supplier, company, vendor, manufacturer, organization, brand, provider
  - Use partial matching (LIKE '%name%' or $regex) to find the company name in the data
  - Check sample values to see which field contains company names
  - Be flexible with capitalization (TechCorp, techcorp, TECHCORP should all match)

WHEN TO USE WORLD KNOWLEDGE:
✅ DO use world knowledge when:
- User asks about geographic regions (West Coast, East Coast, Midwest, etc.)
- User asks about time periods (last quarter, this year, etc.)
- User asks about common categories that can be inferred from data
- User asks about specific companies, suppliers, or organizations by name
- The question requires general knowledge that's not database-specific

❌ DO NOT ask for clarification when:
- You can use world knowledge to resolve the query
- The intent is clear even if the exact field name isn't mentioned
- There's a reasonable interpretation based on common sense
- You can find the company/supplier name in sample values

Rules:
1. **Use World Knowledge First**: Before asking for clarification, check if you can use world knowledge to resolve the query
2. **Smart Field Matching**: If the user mentions a concept (like "West Coast cities" or "TechCorp"), look at sample values to find matching data
3. **Company Name Matching**: For company/supplier queries, check sample values in fields like 'supplier', 'company', 'vendor', 'manufacturer' and use partial matching
4. **Only Ask for Clarification When Truly Ambiguous**: Only return an "ambiguous" response when there are multiple valid interpretations that CANNOT be resolved with world knowledge
5. If the term appears in the sample values of MULTIPLE fields AND you cannot determine which field is intended, you MUST return an "ambiguous" response with specific choices
6. Use partial matching (LIKE, $regex) for proper nouns or names unless the user asks for an exact match

AMBIGUOUS RESPONSE FORMAT:
When you truly need clarification, provide SPECIFIC, ACTIONABLE choices:
{
  "ambiguous": true,
  "message": "Clear explanation of why clarification is needed",
  "choices": [
    "Option 1: Specific interpretation (e.g., 'Search by city field')",
    "Option 2: Alternative interpretation (e.g., 'Search by state field')"
  ]
}

${detailInstruction}

${customInstructions ? `CUSTOM USER INSTRUCTIONS:\n${customInstructions}` : ''}
`
  }

  static buildAnalysisPrompt(question, results, query) {
    return `
      You are a helpful data analyst assistant.
      Analyze the following database results to answer the user's question in a clear, conversational way.
      
      Query Executed: ${query}
      
      Results:
      ${JSON.stringify(results.slice(0, 50), null, 2)} 
      ${results.length > 50 ? '(Note: Only the first 50 rows are shown)' : ''}

      User Question: ${question}

      Provide a natural language summary that directly answers the user's question.
      
      CRITICAL: You MUST return a valid JSON object.
      
      Response Format:
      {
        "answer": "Your plain text response here..."
      }
      
      Rules:
      1. Be concise but informative
      2. Use bullet points or numbered lists when presenting multiple items (use \\n for newlines)
      3. Format numbers with appropriate units (e.g., $120,000 for money, 5 employees)
      4. If showing a list of items, present them clearly
      5. Highlight key insights or patterns in the data
      6. The "answer" field should contain the formatted text string
      
      Example response:
      {
        "answer": "Based on the employee data, 4 employees earn above the average salary of $81,600:\\n\\n• Charlie Brown - $120,000 (Engineering)\\n• Bob Johnson - $95,000 (Engineering)"
      }
    `
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
    `
  }

  static buildTitlePrompt(messages) {
    const recentMessages = messages.slice(-4);
    const conversationText = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');

    // Check if this looks like a query conversation
    const hasQueryKeywords = conversationText.toLowerCase().match(/select|from|where|sum|count|average|group by|join|table|database|query/);

    const additionalGuidance = hasQueryKeywords
      ? '\nThis appears to be a database query conversation. Focus the title on what data was being analyzed or retrieved (e.g., "Sales Summary", "User Activity Report", "Product Inventory Query").'
      : '';

    return `
        Generate a short, concise title (3-6 words) for this chat session based on the conversation below.
        The title should reflect the user's intent or the topic being discussed.
        Do not use quotes. Do not use "Title:". Just return the text.${additionalGuidance}
        
        Conversation:
        ${conversationText}
        `
  }



  static cleanResponse(response, dialect) {
    try {
      if (!response || typeof response !== 'string') return '';

      // 1. Remove markdown code blocks
      let clean = response.replace(/```(sql|kusto|mongo|json)?/g, '').replace(/```/g, '').trim()

      // 2. If dialect is mongodb, try to extract just the JSON object
      if (dialect === 'mongodb') {
        const jsonMatch = clean.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          clean = jsonMatch[0]
        }
      }

      // 3. Check for JSON (ambiguous response) even in SQL dialects
      if (clean.startsWith('{') && clean.endsWith('}')) {
        // It's likely JSON (ambiguous response or mongo)
        return clean
      }

      return clean
    } catch (e) {
      console.warn("Error cleaning up AI response:", e)
      return typeof response === 'string' ? response.trim() : '';
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
