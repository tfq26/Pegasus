import { PromptComposer } from './PromptComposer.js';
import { ToolExecutor } from './ToolExecutor.js';
import { aiClient } from '../../ai/AIClient.js';
import { robustParseJson, logAiUsage } from './ChatUtils.js';
import { logger } from './Logger.js';

/**
 * AIOrchestrator
 * 
 * The main engine for agentic chat generation. Manages the iteration loop,
 * tool execution coordination, and final result synthesis.
 */
export class AIOrchestrator {
    constructor(dependencies) {
        this.spreadsheetToolService = dependencies.spreadsheetToolService;
        this.visualizationAnalyzer = dependencies.visualizationAnalyzer;
        this.onProgress = dependencies.onProgress || (async () => { });
        this.context = dependencies.context || {};
    }

    /**
     * Executes the agentic generation loop.
     */
    async generate(basePrompt, aiSettings, contextData) {
        this.context = { ...contextData, ...aiSettings };
        const { provider, adapter, normalizedSchema, userId, connectionId, activeTable, resolvedResources, requestId } = contextData;
        const maxIterations = 4;
        let iterations = 0;

        let currentPrompt = PromptComposer.composeInitialPrompt(basePrompt, {
            now: new Date(),
            contextBlock: contextData.contextBlock
        });

        // Apply high-level strategy hints
        currentPrompt = PromptComposer.injectStrategyHint(currentPrompt, aiSettings.intent);

        const toolExecutor = new ToolExecutor({
            spreadsheetToolService: this.spreadsheetToolService,
            context: { ...contextData, userId, connectionId, activeTable, ...aiSettings }
        });

        let lastResult = null;
        let lastToolResult = null;

        while (iterations < maxIterations) {
            iterations++;
            const progressBase = 30 + (iterations * 15);
            await this.onProgress(Math.min(progressBase, 90), `Thinking (Step ${iterations})...`);

            const requestId = this.context.requestId;
            logger.info(`[AIOrchestrator] Iteration ${iterations}...`, { requestId });

            // 1. AI Generation Call
            const generationOptions = {
                dialect: provider,
                schema: {
                    ...normalizedSchema,
                    dataProfile: aiSettings.dataProfile,
                    conversationContext: aiSettings.conversationContext
                },
                previousContext: aiSettings.previousContext || [],
                conversationContext: aiSettings.conversationContext,
                dataProfile: aiSettings.dataProfile
            };

            const result = await Promise.race([
                aiClient.generateQuery(currentPrompt, generationOptions, aiSettings),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Generation Timeout')), 25000))
            ]);

            lastResult = result;

            // 2. Terminate if no tool calls
            if (!result.toolCalls || result.toolCalls.length === 0) {
                break;
            }

            logger.info(`[AIOrchestrator] Tool calls: ${result.toolCalls.map(t => t.function.name).join(', ')}`, { requestId: this.context.requestId });
            await this.onProgress(Math.min(progressBase + 5, 95), `Executing tools (${result.toolCalls.length})...`);

            // 3. Sequential handling of special tools or batch execution
            let toolExit = false;
            for (const toolCall of result.toolCalls) {
                const toolName = toolCall.function.name;

                // Handle "Generate Table" (Immediate realization)
                if (toolName === 'generate_table') {
                    const args = JSON.parse(toolCall.function.arguments);
                    const finalData = await this._handleTableGeneration(args.tableName, aiSettings.modelId);
                    return { type: 'generated_table', ...finalData, usage: result.usage };
                }

                // Execute via ToolExecutor
                const res = await toolExecutor.executeSingle(toolCall);

                // Check if we should exit immediately (e.g. forceQuery)
                if (aiSettings.intent?.force && toolName === 'query_data') {
                    return { ...res, usage: result.usage, contextUsed: resolvedResources };
                }

                // Build context for next iteration
                const resultContext = PromptComposer.composeToolResult(toolName, JSON.parse(toolCall.function.arguments), res);
                currentPrompt += `\n\n${resultContext}`;

                // Capture tool result for later analysis (visualization)
                lastToolResult = res;

                // Decision: Should we continue the loop or stop?
                if (this._shouldStopAfterTool(toolName, res, iterations, aiSettings)) {
                    toolExit = true;
                    break;
                }
            }

            if (toolExit) break;
        }

        // 4. Final Analysis / Output Refinement
        return this._finalizeResponse(lastResult, lastToolResult, currentPrompt, aiSettings, resolvedResources);
    }

    async _handleTableGeneration(tableName, modelId) {
        const genPrompt = `Generate table for "${tableName}". Return JSON: { "tableName": "...", "headers": [], "rows": [] }`;
        const dataRes = await aiClient.generateContent([{ role: 'user', content: genPrompt }], { model: modelId, json: true });
        return JSON.parse(dataRes.text.replace(/```json | ```/g, '').trim());
    }

    /**
     * Internal: Decides whether the iteration loop should continue.
     */
    _shouldStopAfterTool(toolName, result, iterations, settings) {
        if (iterations >= 4) return true;
        // RELAXED BREAK: Previously stopped if rows > 100.
        // Now we trust PromptComposer to truncate results, allowing the AI to always have a final "synthesis" turn.
        if (toolName === 'get_table_schema' || toolName === 'get_sample_data' || toolName === 'search_web') return false;

        // If it's a direct query result and we already have some text, we can stop, 
        // but if text is empty, we MUST continue to get a summary.
        return false;
    }

    async _finalizeResponse(aiResult, lastToolResult, prompt, settings, resources) {
        const { normalizedSchema, provider, userId, activeModel, connectionId } = this.context;
        let generatedQuery = aiResult.text || '';

        // 1. JSON Parsing & Multi-step handling
        if (generatedQuery.trim()) {
            const parsed = robustParseJson(generatedQuery);

            // Clarification question — AI needs more info before it can proceed
            if (parsed.type === 'clarification' && parsed.question) {
                return {
                    type: 'clarification',
                    question: parsed.question,
                    interpretation: parsed.interpretation || '',
                    confidence: parsed.confidence ?? null,
                    hints: parsed.hints || [],
                    usage: aiResult.usage,
                    contextUsed: resources
                };
            }

            if (parsed.multi_step && parsed.steps?.length > 0) {
                generatedQuery = parsed.steps[0].query;
            } else if (parsed.query) {
                generatedQuery = parsed.query;
            } else if (parsed.analysis || parsed.answer || parsed.explanation) {
                const content = parsed.analysis || parsed.answer || parsed.explanation;
                return {
                    type: 'data_response',
                    ...lastToolResult,
                    text: content,
                    message: content,
                    analysis: content,
                    usage: aiResult.usage,
                    contextUsed: resources,
                    needs_disclaimer: parsed.needs_disclaimer || false
                };
            }
        }

        // Usage Logging
        if (aiResult.usage) {
            await logAiUsage(userId, aiResult.usage.totalTokens, activeModel, 'ai_generation', prompt, connectionId);
        }

        // 2. Denormalization
        const { SchemaTranslator } = await import('./SchemaTranslator.js');
        const translator = new SchemaTranslator();
        translator.tableMapping = new Map(Object.entries(normalizedSchema.mappings?.tables || {}));
        translator.columnMapping = new Map(Object.entries(normalizedSchema.mappings?.columns || {}));

        if (translator.hasNormalizations() && generatedQuery && !generatedQuery.startsWith('{')) {
            generatedQuery = translator.denormalizeQuery(generatedQuery, provider);
        }

        // 3. Refusal / Explanation detection
        const lowerQuery = generatedQuery.toLowerCase();
        const isPlainExplanation = (generatedQuery.length > 20 && !lowerQuery.includes('select ') && !generatedQuery.startsWith('{')) ||
            lowerQuery.startsWith('i cannot') || lowerQuery.startsWith('i am sorry');

        if (isPlainExplanation) {
            return {
                type: 'text',
                text: generatedQuery,
                message: generatedQuery,
                usage: aiResult.usage,
                contextUsed: resources
            };
        }

        // 4. Fallback Synthesis Turn (MANDATORY)
        // If text is empty or the AI only returned a JSON/SQL block without a human summary,
        // do a dedicated synthesis call to generate a plain-language answer.
        if (lastToolResult && (!aiResult.text || aiResult.text.trim() === '' || aiResult.text.startsWith('{') || aiResult.text.startsWith('[')) && !settings.forceQuery) {
            logger.info("[AIOrchestrator] Performing fallback synthesis turn...", { requestId: this.context.requestId });
            try {
                const results = lastToolResult.data || lastToolResult.rows || lastToolResult.results;
                if (results) {
                    const analysis = await aiClient.analyzeResults(
                        settings.prompt || prompt,
                        results,
                        generatedQuery,
                        settings.modelId,
                        { ...normalizedSchema, sourceRegistry: normalizedSchema.sourceRegistry }
                    );

                    if (analysis && analysis.text) {
                        const parsedAnalysis = robustParseJson(analysis.text);
                        const finalMessage = parsedAnalysis.answer || parsedAnalysis.analysis || analysis.text;

                        return {
                            type: 'data_response',
                            ...lastToolResult,
                            query: generatedQuery,
                            message: finalMessage,
                            analysis: finalMessage,
                            text: finalMessage,
                            usage: {
                                ...aiResult.usage,
                                totalTokens: (aiResult.usage?.totalTokens || 0) + (analysis.usage?.totalTokens || 0)
                            },
                            contextUsed: resources
                        };
                    }
                }
            } catch (synthErr) {
                logger.warn("[AIOrchestrator] Fallback synthesis failed:", synthErr.message);
            }
        }


        // 5. Normal Structured Response
        if (lastToolResult && (lastToolResult.data || lastToolResult.results)) {
            const vizResult = (settings.forceText && !settings.forceVisualization)
                ? { shouldVisualize: false, blueprint: null }
                : await this.visualizationAnalyzer.analyze(prompt, lastToolResult.data || lastToolResult.results, settings.modelId, userId, settings.forceVisualization);

            const responseText = aiResult.text && aiResult.text.trim() ? aiResult.text : null;
            return {
                type: 'data_response',
                ...lastToolResult,
                query: generatedQuery,
                vizBlueprint: vizResult?.blueprint,
                config: vizResult?.blueprint,
                message: responseText,
                analysis: responseText,
                text: responseText,
                usage: aiResult.usage,
                contextUsed: resources
            };
        }

        return {
            type: 'text',
            text: aiResult.text,
            message: aiResult.text,
            query: generatedQuery,
            usage: aiResult.usage,
            contextUsed: resources
        };
    }
}
