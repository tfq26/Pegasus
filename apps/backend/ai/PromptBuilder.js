export class PromptBuilder {
    static buildQueryPrompt(context) {
        const { dialect, schema } = context

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
You MUST return ONLY the raw SQL query. No JSON wrapper, no markdown, no explanations.

RULES:
1. Return valid ${dialect} SQL syntax only
2. Use appropriate quoting for table/column names if they contain special characters
3. For partial text matches, use LIKE with wildcards: WHERE column LIKE '%search%'
4. Always include a LIMIT clause (default 100)
5. When selecting data, include primary keys or identifying columns
6. JOINs are encouraged if data is split across tables.

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
IMPORTANT - Kusto (KQL) Query Format:
- Return valid KQL syntax.
- For data queries, start with table name: TableName | where ...
- For management (creating tables/data), use Control Commands starting with dot (.).
- NEVER start a query with a pipe (|). Always start with the table name.

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

        return `
You are an expert database engineer specializing in ${dialect} databases.
Your task is to convert the user's natural language request into a valid ${dialect} query.

${formatInstructions}
${schemaPresentation}

Rules:
1. Return ONLY the raw query code (or JSON for MongoDB/Ambiguous). No markdown formatting, no explanations, no comments.
2. Use ONLY the collections/tables listed in the schema above. Do not hallucinate names.
3. If the request is ambiguous (e.g. multiple tables could apply), return a JSON object with "ambiguous": true.
4. Ensure the query format matches the database type exactly.
5. When selecting specific columns, ALWAYS include the primary key or identifying columns (like id, name, _id) to make the results meaningful, even if not explicitly asked.
6. For MongoDB, ALWAYS include a "reasoning" field explaining your thought process.
7. For DDL (CREATE, DROP, ALTER) or mutations (INSERT, UPDATE, DELETE), generate the standard SQL command. Do NOT refuse to generate these queries.
8. NEVER return an empty string. If you cannot generate a query, return a JSON object with "error": "Reason...".

FUZZY MATCHING & AMBIGUITY RULES:
1. If the user searches for a term (e.g. "New Mexico") that is not an exact match for a field name, check the "Sample Values" provided in the schema.
2. If the term appears in the sample values of a specific field, query that field.
3. If the term appears in the sample values of MULTIPLE fields (e.g. "team_name" and "location"), you MUST return an "ambiguous" response asking the user to clarify.
4. Use partial matching (LIKE, $regex) for proper nouns or names unless the user asks for an exact match.
`
    }

    static buildAnalysisPrompt(question, results, query) {
        return `
      You are a data analyst.
      Analyze the following database results to answer the user's question.
      
      Query Executed: ${query}
      
      Results:
      ${JSON.stringify(results.slice(0, 50), null, 2)} 
      (Note: Only the first 50 rows are shown)

      User Question: ${question}

      Your task is to provide the answer the user is looking for.
      
      Rules:
      1. If the user is asking for a specific list of values (e.g. "just the names", "list the emails"), extract those values into a JSON array in the "extractedList" field.
      2. If the user is asking for a summary or analysis, provide it in the "summary" field.
      3. If the user asks for a single value (e.g. "what is the total?"), put it in "extractedList" as a single item AND provide a "summary".
      
      Output JSON Schema:
      {
        "summary": "Text explanation...",
        "extractedList": ["Item 1", "Item 2"] // Optional, use only if user asked for a list/specific values
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

        return `
        Generate a short, concise title (3-6 words) for this chat session based on the conversation below.
        The title should reflect the user's intent or the topic being discussed.
        Do not use quotes. Do not use "Title:". Just return the text.
        
        Conversation:
        ${conversationText}
        `
    }



    static cleanResponse(response, dialect) {
        try {
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
            return response.trim()
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
