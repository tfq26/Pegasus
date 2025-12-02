import { GoogleGenerativeAI } from "@google/generative-ai"
import { AIProvider } from "./AIProvider.js"

export class GeminiProvider extends AIProvider {
    constructor(config) {
        super(config)
        this.genAI = new GoogleGenerativeAI(config.apiKey)
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
    }

    async generateQuery(prompt, context) {
        const { dialect, schema, previousContext } = context

        // Database-specific format instructions
        let formatInstructions = ''
        let schemaPresentation = ''
        let generationConfig = {
            maxOutputTokens: 1000,
        }

        if (dialect === 'mongodb') {
            // Note: We're NOT using responseMimeType here because it can cause empty responses
            // Instead, we rely on explicit instructions in the prompt

            // Extract collections list
            const collections = schema.collections || schema.tables || []
            const samples = schema.samples || {}
            const sampleValues = schema.sampleValues || {}
            const totalCollections = schema.totalCollections || collections.length
            const filtered = schema.filtered || false

            // Build a clear schema presentation
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
        } else if (dialect === 'mysql') {
            // Extract tables and sample values
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
IMPORTANT - MySQL Query Format:
You MUST return ONLY the raw SQL query. No JSON wrapper, no markdown, no explanations.

RULES:
1. Return valid SQL syntax only
2. Use backticks for table/column names if they contain special characters
3. For partial text matches (like searching for "New Mexico"), use LIKE with wildcards: WHERE column LIKE '%New Mexico%'
4. For case-insensitive searches, use LOWER() or UPPER() functions
5. Always include a LIMIT clause (default 100) to prevent overwhelming results
6. When selecting data, include primary keys or identifying columns

EXAMPLES:
1. Simple query:
   SELECT * FROM users WHERE status = 'active' LIMIT 10

2. Partial text match:
   SELECT * FROM teams WHERE team_name LIKE '%New Mexico%' LIMIT 100

3. Case-insensitive search:
   SELECT * FROM products WHERE LOWER(name) LIKE LOWER('%laptop%') LIMIT 50

4. JOIN query:
   SELECT u.id, u.name, o.order_id FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 'active' LIMIT 20

NOTE: If the request is ambiguous, you may return a comment at the start:
-- AMBIGUOUS: Please clarify whether you want X or Y
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
- Return valid KQL syntax
- Start with table name followed by pipe operators
- Example: TableName | where Status == "active" | take 10
- Use KQL operators: where, project, summarize, take, sort, join, etc.
`
        } else if (dialect === 'sqlite') {
            // SQLite uses similar SQL syntax to MySQL
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
IMPORTANT - SQLite Query Format:
You MUST return ONLY the raw SQL query. No JSON wrapper, no markdown, no explanations.

RULES:
1. Return valid SQLite SQL syntax only
2. Use double quotes for table/column names if they contain special characters
3. For partial text matches, use LIKE with wildcards: WHERE column LIKE '%search%'
4. SQLite is case-insensitive by default for LIKE operations
5. Always include a LIMIT clause (default 100)
6. When selecting data, include primary keys or identifying columns

EXAMPLES:
1. Simple query:
   SELECT * FROM users WHERE status = 'active' LIMIT 10

2. Partial text match:
   SELECT * FROM teams WHERE team_name LIKE '%New Mexico%' LIMIT 100

3. JOIN query:
   SELECT u.id, u.name, o.order_id FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = 'active' LIMIT 20

NOTE: If the request is ambiguous, you may return a comment at the start:
-- AMBIGUOUS: Please clarify whether you want X or Y
`
        }

        const systemInstruction = `
You are an expert database engineer specializing in ${dialect} databases.
Your task is to convert the user's natural language request into a valid ${dialect} query.

${formatInstructions}
${schemaPresentation}

Rules:
1. Return ONLY the raw query code (or JSON for MongoDB). No markdown formatting, no explanations, no comments.
2. Use ONLY the collections/tables listed in the schema above. Do not hallucinate names.
3. If the request is ambiguous (e.g. multiple tables could apply), return a JSON object with this EXACT structure:
   {
     "ambiguous": true,
     "message": "Explanation of ambiguity...",
     "choices": ["Option 1", "Option 2"]
   }
4. Ensure the query format matches the database type exactly.
5. When selecting specific columns, ALWAYS include the primary key or identifying columns (like id, name, _id) to make the results meaningful, even if not explicitly asked.
6. For MongoDB, ALWAYS include a "reasoning" field explaining your thought process.

FUZZY MATCHING & AMBIGUITY RULES:
1. If the user searches for a term (e.g. "New Mexico") that is not an exact match for a field name, check the "Sample Values" provided in the schema.
2. If the term appears in the sample values of a specific field, query that field.
3. If the term appears in the sample values of MULTIPLE fields (e.g. "team_name" and "location"), you MUST return an "ambiguous" response asking the user to clarify.
4. Use partial matching (LIKE, $regex) for proper nouns or names unless the user asks for an exact match.
    `

        const history = (previousContext || [])
            .filter(msg => msg.content)
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }))

        const chat = this.model.startChat({
            history,
            generationConfig,
        })

        const result = await chat.sendMessage(systemInstruction + "\n\nUser Request: " + prompt)
        const response = result.response.text()

        console.log('[AI] Raw response:', response)

        // Robust JSON extraction
        try {
            // 1. Remove markdown code blocks (just in case)
            let clean = response.replace(/```(sql|kusto|mongo|json)?/g, '').replace(/```/g, '').trim()

            // 2. If dialect is mongodb, try to extract just the JSON object if it's not already clean
            if (dialect === 'mongodb') {
                const jsonMatch = clean.match(/\{[\s\S]*\}/)
                if (jsonMatch) {
                    clean = jsonMatch[0]
                }
            }

            return clean
        } catch (e) {
            console.warn("Error cleaning up AI response:", e)
            return response.trim()
        }
    }

    async analyzeResults(question, results, query) {
        const systemInstruction = `
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

        const result = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: systemInstruction }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        })
        return result.response.text()
    }

    async disambiguate(term, candidates) {
        const systemInstruction = `
      The user is searching for "${term}" in a database.
      Here are the candidate tables/columns found:
      ${JSON.stringify(candidates, null, 2)}

      Which of these are the most relevant?
      Return a JSON array of the top matches (max 8).
      If none are relevant, return an empty array.
      
      Output format: ["match1", "match2"]
    `

        const result = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: systemInstruction }] }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        })
        const text = result.response.text()

        try {
            // Clean up markdown if present (though JSON mode usually avoids it)
            const jsonStr = text.replace(/```(json)?/g, '').replace(/```/g, '').trim()
            return JSON.parse(jsonStr)
        } catch (e) {
            console.warn("Failed to parse disambiguation response", e)
            return candidates.slice(0, 8) // Fallback
        }
    }

    async listModels() {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.apiKey}`
            )

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()

            if (data.models) {
                return data.models
                    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                    .map(m => ({
                        id: m.name.replace('models/', ''),
                        name: m.displayName,
                        description: m.description,
                        contextWindow: m.inputTokenLimit
                    }))
            }
            return []
        } catch (error) {
            console.error("Error listing models:", error)
            return []
        }
    }
}
