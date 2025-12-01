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

        if (dialect === 'mongodb') {
            // Extract collections list
            const collections = schema.collections || schema.tables || []
            const samples = schema.samples || {}
            const totalCollections = schema.totalCollections || collections.length
            const filtered = schema.filtered || false

            // Build a clear schema presentation
            schemaPresentation = `\nAvailable Collections${filtered ? ` (showing ${collections.length} of ${totalCollections} total, filtered by relevance)` : ` (${collections.length} total)`}:\n`
            collections.forEach(coll => {
                schemaPresentation += `- ${coll}`
                if (samples[coll]) {
                    schemaPresentation += ` (fields: ${samples[coll].join(', ')})`
                }
                schemaPresentation += '\n'
            })

            formatInstructions = `
CRITICAL - MongoDB Query Format Rules:
You MUST return a JSON object with this EXACT structure:
{
  "collection": "collection_name",
  "filter": { ...query... },
  "limit": 10
}

REQUIRED FIELDS:
- "collection": MUST be one of the available collections listed below
- "filter": MongoDB query object using operators like $eq, $gt, $lt, $in, $and, $or
- "limit": Number of results (optional, defaults to 1000)

EXAMPLES:
1. Simple query:
   {"collection": "users", "filter": {"status": "active"}, "limit": 10}

2. With operators:
   {"collection": "orders", "filter": {"amount": {"$gt": 100}, "status": "completed"}}

3. Complex query:
   {"collection": "products", "filter": {"$and": [{"price": {"$lt": 50}}, {"inStock": true}]}, "limit": 20}

4. Aggregation pipeline:
   {"collection": "sales", "pipeline": [{"$match": {"year": 2024}}, {"$group": {"_id": "$product", "total": {"$sum": "$amount"}}}]}

DO NOT:
- Use db.collection.find() syntax
- Return just a filter object without the collection field
- Make up collection names not in the schema
`
        } else if (dialect === 'mysql') {
            schemaPresentation = `\nAvailable Tables:\n${(schema.tables || []).map(t => `- ${t}`).join('\n')}`
            formatInstructions = `
IMPORTANT - MySQL Query Format:
- Return valid SQL syntax
- Use proper table and column escaping with backticks if needed
- Example: SELECT * FROM \`users\` WHERE status = 'active' LIMIT 10
- Support standard SQL operations: SELECT, INSERT, UPDATE, DELETE, JOIN, etc.
`
        } else if (dialect === 'kusto') {
            schemaPresentation = `\nAvailable Tables:\n${(schema.tables || []).map(t => `- ${t}`).join('\n')}`
            formatInstructions = `
IMPORTANT - Kusto (KQL) Query Format:
- Return valid KQL syntax
- Start with table name followed by pipe operators
- Example: TableName | where Status == "active" | take 10
- Use KQL operators: where, project, summarize, take, sort, join, etc.
`
        }

        const systemInstruction = `
You are an expert database engineer specializing in ${dialect} databases.
Your task is to convert the user's natural language request into a valid ${dialect} query.

${formatInstructions}
${schemaPresentation}

Rules:
1. Return ONLY the raw query code. No markdown formatting, no explanations, no comments.
2. Use ONLY the collections/tables listed in the schema above. Do not hallucinate names.
3. If the request is ambiguous (e.g. multiple tables could apply), return a JSON object with: { "ambiguous": true, "message": "Explanation...", "choices": ["Option 1", "Option 2"] }.
4. Ensure the query format matches the database type exactly.
5. For MongoDB: Return a STRICT JSON object representing the query parts. Do NOT use 'db.collection.find(...)'. Format: { "collection": "name", "filter": { ... }, "limit": 100 }.
6. When selecting specific columns, ALWAYS include the primary key or identifying columns (like id, name, _id) to make the results meaningful, even if not explicitly asked.
    `

        const history = (previousContext || [])
            .filter(msg => msg.content)
            .map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }))

        const chat = this.model.startChat({
            history,
            generationConfig: {
                maxOutputTokens: 1000,
            },
        })

        const result = await chat.sendMessage(systemInstruction + "\n\nUser Request: " + prompt)
        const response = result.response.text()

        // Robust JSON extraction
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

      Provide a concise summary of the findings. 
      If the results are empty, explain that no data matched the criteria.
    `

        const result = await this.model.generateContent(systemInstruction)
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

        const result = await this.model.generateContent(systemInstruction)
        const text = result.response.text()

        try {
            // Clean up markdown if present
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
