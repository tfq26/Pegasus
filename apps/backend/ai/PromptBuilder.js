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
4. Always include a LIMIT clause (default 100)
5. When selecting data, include primary keys or identifying columns
6. JOINs are encouraged if data is split across tables.
7. CRITICAL: DO NOT include simulated results (e.g. "Results: [...]") or explanations after the query.

AMBIGUITY & JOINS:
1. If the request requires data from MULTIPLE tables (JOIN), you MUST verify that the join is logical.
2. If the join is ambiguous (e.g. multiple ways to join), return a JSON object with "ambiguous": true.
3. If the user asks for something that could be in multiple tables (e.g. "users" could mean "users" table or "admin_users" table), return "ambiguous": true.

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

      formatInstructions = `
IMPORTANT - SurrealDB (SurrealQL) Query Format:
You are an intelligent query planner for Pegasus. You understand SurrealDB's limitations and can break down complex queries into executable steps.

RESPONSE FORMATS:

1. MULTI-STEP (for complex queries):
{
  "multi_step": true,
  "steps": [
    { "query": "...", "explanation": "..." },
    { "query": "...", "explanation": "..." }
  ]
}

2. SINGLE QUERY (for simple queries):
Just return the SurrealQL query string

3. AMBIGUOUS:
{
  "ambiguous": true,
  "message": "...",
  "choices": [...]
}

TABLE NAME MATCHING:
When the user mentions a table name, intelligently match it to available tables:
- "employees" → "employee" (plural to singular)
- "employee" → "employee" (exact match preferred)
- "data_xxx_employees" → match if it contains "employee"
- Be flexible with capitalization and common variations
- If multiple tables match, prefer the shorter/simpler name
- Example: User says "employees" and you see both "employee" and "data_abc_employees", use "employee"

SURREALDB LIMITATIONS YOU MUST WORK AROUND:
âŒ NO aggregate functions in SELECT (AVG, SUM, COUNT, array_agg)
âŒ NO GROUP BY with aggregations
âŒ NO LET statements or variables
âŒ NO WITH clauses
âŒ NO window functions
âŒ NO self-joins with aggregates

âœ… WHAT WORKS:
- Simple SELECT with WHERE, ORDER BY, LIMIT
- RETURN with math::mean/sum/max/min on subquery arrays
- Multiple independent queries executed in sequence

INTELLIGENT MULTI-STEP STRATEGY:

For "average salary by department":
Step 1: Get unique departments â†’ SELECT Department FROM employee GROUP BY Department
Step 2: For EACH department, calculate average â†’ RETURN math::mean((SELECT VALUE type::number(Salary) FROM employee WHERE Department = 'Sales'))
Step 3: Repeat for each department found in Step 1

For "employees below their department average":
Step 1: Get unique departments
Step 2: Calculate average for each department
Step 3: For each department, find employees below that average
Step 4: Combine results with calculated differences

CONCRETE EXAMPLE - Complex Query:
User: "Show employees in departments where average salary > 80000, but only those earning less than their dept average"

YOUR RESPONSE:
{
  "multi_step": true,
  "steps": [
    {
      "query": "SELECT Department FROM employee GROUP BY Department",
      "explanation": "First, discover all unique departments"
    },
    {
      "query": "RETURN math::mean((SELECT VALUE type::number(Salary) FROM employee WHERE Department = 'Sales'))",
      "explanation": "Calculate average salary for Sales department"
    },
    {
      "query": "RETURN math::mean((SELECT VALUE type::number(Salary) FROM employee WHERE Department = 'Engineering'))",
      "explanation": "Calculate average salary for Engineering department"
    },
    {
      "query": "RETURN math::mean((SELECT VALUE type::number(Salary) FROM employee WHERE Department = 'Management'))",
      "explanation": "Calculate average salary for Management department"
    },
    {
      "query": "SELECT * FROM employee WHERE Department = 'Management' AND type::number(Salary) < 120000 ORDER BY Salary DESC LIMIT 100",
      "explanation": "Get Management employees below their department average (120000), if average > 80000"
    }
  ]
}

RULES:
1. ALWAYS use multi-step for queries involving:
   - "average by", "sum by", "count by"
   - "below average", "above average"
   - Multiple aggregations
   - Filtering based on aggregated values

2. AGGREGATION SYNTAX:
   - Average: RETURN math::mean((SELECT VALUE type::number(column) FROM table WHERE ...))
   - Sum: RETURN math::sum((SELECT VALUE type::number(column) FROM table WHERE ...))
   - Max: RETURN math::max((SELECT VALUE type::number(column) FROM table WHERE ...))
   - Min: RETURN math::min((SELECT VALUE type::number(column) FROM table WHERE ...))

3. SORTING:
   - Use ORDER BY column NUMERIC for numeric sorting
   - NEVER use ORDER BY type::number(column) - syntax error

4. LIMITS:
   - Always include LIMIT (default 100) unless aggregating

5. FALLBACK:
   If a query is genuinely impossible even with multi-step (e.g., requires true window functions):
   {
     "error": true,
     "message": "This query requires advanced SQL features that Pegasus doesn't currently support. Try breaking it into simpler questions."
   }

CRITICAL: DO NOT include simulated results. Only return the query plan.
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

Rules:
3. If the term appears in the sample values of MULTIPLE fields (e.g. "team_name" and "location"), you MUST return an "ambiguous" response asking the user to clarify.
4. Use partial matching (LIKE, $regex) for proper nouns or names unless the user asks for an exact match.

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
      
      Rules:
      1. Be concise but informative
      2. Use bullet points or numbered lists when presenting multiple items
      3. Format numbers with appropriate units (e.g., $120,000 for money, 5 employees)
      4. If showing a list of items, present them clearly
      5. Highlight key insights or patterns in the data
      6. Use plain text only - no JSON, no markdown code blocks
      
      Example good response:
      "Based on the employee data, 4 employees earn above the average salary of $81,600:
      
      • Charlie Brown - $120,000 (Engineering)
      • Bob Johnson - $95,000 (Management)
      • Alice Smith - $85,000 (Sales)
      • Diana Prince - $82,000 (Engineering)
      
      These employees earn between $400 and $38,400 above the company average."
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
