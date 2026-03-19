import { DataContextService } from './DataContextService.js';
import { promptRegistry } from '../../ai/PromptRegistry.js';
import { adapters } from '../../adapters/index.js';
import { aiClient } from '../../ai/AIClient.js';

export class InspectorService {
    static async analyze(userId, connectionId, question) {
        console.log(`[InspectorService] Analyzing with Gemini: "${question}"`);

        // 1. Build Context
        const context = await DataContextService.buildContext(userId, connectionId, { 
            userMessage: question,
            modelId: 'gemini'
        });

        const trace = context.adapter?.trace || [];

        // 2. Prepare RAW Schema and Samples for AI (DuckDB is case-sensitive)
        const rawSqlSchema = {};
        const rawSamples = {};
        
        // Use mappings to reconstruct the exact identifiers
        Object.entries(context.normalizedSchema.detailedSchema).forEach(([normTable, cols]) => {
            const realTable = context.normalizedSchema.mappings?.tables?.[normTable] || normTable;
            rawSqlSchema[realTable] = cols.map(c => ({
                name: c.originalName || c.name,
                type: c.type,
                nullable: c.nullable
            }));

            // Also map samples to the real table name
            if (context.normalizedSchema.semanticContext.samples?.[normTable]) {
                rawSamples[realTable] = context.normalizedSchema.semanticContext.samples[normTable];
            }
        });

        // 3. Generate Interpretation with Tags
        const prompt = promptRegistry.get('extreme_transparency', {
            question,
            schema: JSON.stringify(rawSqlSchema, null, 2),
            samples: JSON.stringify(rawSamples, null, 2),
            processing_trace: JSON.stringify(trace, null, 2)
        });

        // Correct signature: (prompt, modelId, options)
        console.log(`[InspectorService] Calling generateText: model='gemini', userId='${userId}', promptType='${typeof prompt}'`);
        const rawResponse = await aiClient.generateText(prompt, 'gemini', { userId });
        console.log(`[InspectorService] Raw AI Response Length: ${rawResponse.length}`);
        // console.log(`[InspectorService] Raw AI Response: ${rawResponse}`); // Useful for deep debugging

        // Tag extraction helper
        const extractTag = (text, tag) => {
            const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
            const match = text.match(regex);
            return match ? match[1].trim() : null;
        };

        const interpretation = extractTag(rawResponse, 'interpretation');
        const schemaAnalysis = extractTag(rawResponse, 'schema_analysis');
        const queryToExecute = extractTag(rawResponse, 'query_generation');
        let finalAnalysis = extractTag(rawResponse, 'synthesis');
        let resultData = null;

        if (!queryToExecute) {
            console.warn(`[InspectorService] No query found in response. Raw snippet: ${rawResponse.substring(0, 100)}...`);
            trace.push({ timestamp: new Date().toISOString(), message: "AI did not generate a executable query tags." });
        }

        console.log(`[InspectorService] Extracted - Interpretation: ${!!interpretation}, Schema: ${!!schemaAnalysis}, Query: ${!!queryToExecute}, Synthesis: ${!!finalAnalysis}`);

        // 3. Execute the generated query if present
        if (queryToExecute && context.adapter) {
            try {
                // Remove generic markdown if AI included it inside the tag
                const cleanQueryUser = queryToExecute.replace(/```sql\s*|```/gi, '').trim();
                console.log(`[InspectorService] Executing extracted query: ${cleanQueryUser}`);
                
                resultData = await context.adapter.query(cleanQueryUser);
                trace.push({ timestamp: new Date().toISOString(), message: `Successfully executed query: ${cleanQueryUser.substring(0, 50)}...` });
            } catch (queryErr) {
                console.warn(`[InspectorService] Query execution failed: ${queryErr.message}`);
                trace.push({ timestamp: new Date().toISOString(), message: `Query failed: ${queryErr.message}` });
            }
        }

        // 4. Final Synthesis phase (Run even on query failure to explain to user)
        console.log(`[InspectorService] Performing synthesis turn...`);
        try {
            const synthesis = await aiClient.analyzeResults(
                question,
                resultData || { error: trace.find(t => t.message.includes('Query failed'))?.message || 'Query execution skipped or failed' },
                queryToExecute,
                'gemini',
                context.normalizedSchema
            );
            
            // Check if synthesis is an object with text property or a plain string
            finalAnalysis = synthesis.text || synthesis;
            
            if (resultData) {
                trace.push({ timestamp: new Date().toISOString(), message: "Synthesis complete with data." });
            } else {
                trace.push({ timestamp: new Date().toISOString(), message: "Synthesis complete with error explanation." });
            }
        } catch (synthErr) {
            console.warn(`[InspectorService] Synthesis failed: ${synthErr.message}`);
            trace.push({ timestamp: new Date().toISOString(), message: `Synthesis failed: ${synthErr.message}` });
        }

        return {
            rawResponse: finalAnalysis || '[Analysis Complete - No Synthesis Provided]',
            fullTaggedResponse: rawResponse, // Return the original for frontend step parsing
            context: context.normalizedSchema,
            trace: trace,
            data: resultData,
            query: queryToExecute
        };
    }

    static async _callAI(prompt, userId) {
        // Implementation using actual Gemini model
        return await aiClient.generateText(prompt, 'gemini', { userId });
    }
}
