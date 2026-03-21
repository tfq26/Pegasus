import { OneContext } from '../OneContext.js';
import { ConversationState } from '../ConversationState.js';
import { logger } from '../Logger.js';
import { aiClient } from '../../../ai/AIClient.js';
import { spreadsheetToolService } from '../SpreadsheetToolService.js';
import { VisualizationAnalyzer } from '../../../ai/VisualizationAnalyzer.js';
import { IntentRouter } from './IntentRouter.js';
import { SourceSelector } from './SourceSelector.js';
import { StructuredContextBuilder } from './StructuredContextBuilder.js';
import { TextContextBuilder } from './TextContextBuilder.js';
import { ExecutionPlanner } from './ExecutionPlanner.js';
import { PipelineToolExecutor } from './PipelineToolExecutor.js';
import { EvidenceSynthesizer } from './EvidenceSynthesizer.js';

const verbosePipelineLogs = process.env.PEGASUS_VERBOSE_PIPELINE === 'true';
const logPipelineDebug = (message, meta) => {
    if (verbosePipelineLogs) {
        logger.debug(message, meta);
    }
};

function buildVisualizationSpec(blueprint) {
    if (!blueprint) return null;
    return {
        chartType: blueprint.type,
        title: blueprint.title,
        xField: blueprint.xAxis,
        yFields: blueprint.yAxis || [],
        seriesField: null,
        aggregation: null,
        reasoning: blueprint.reasoning || ''
    };
}

function buildRefinementSuggestions({ intent, selectedSources, rows = [], hasTextEvidence = false, query = null }) {
    const suggestions = [];
    const columns = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
    const timeColumn = columns.find((column) => /date|time|timestamp|created|updated|day|hour/i.test(column));
    const categoryColumn = columns.find((column) => !/date|time|timestamp|created|updated/i.test(column));
    const lowerQuery = String(query || '').toLowerCase();
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const alreadyGroupedByCategory = categoryColumn ? lowerQuery.includes(`group by "${categoryColumn.toLowerCase()}"`) || lowerQuery.includes(`group by ${categoryColumn.toLowerCase()}`) : false;

    if (intent?.needsStructured) {
        if (categoryColumn && !alreadyGroupedByCategory && rowCount > 1) {
            suggestions.push(`Break this down by ${categoryColumn}`);
        }
        if (timeColumn) suggestions.push(`Show the recent trend by ${timeColumn}`);
        if (categoryColumn) {
            suggestions.push(`Show the top 5 ${categoryColumn} outliers`);
        } else if (rowCount > 2) {
            suggestions.push('Focus on the top outliers');
        }
    }

    if (hasTextEvidence) {
        suggestions.push('Explain the likely drivers from notes');
    }

    if (intent?.wantsVisualization) {
        suggestions.push('Turn this into a chart');
    }

    return [...new Set(suggestions)].slice(0, 3);
}

function toLegacyAnswerShape(result) {
    if (result.type === 'data_answer') {
        return {
            ...result,
            type: 'data_answer',
            data: result.results,
            message: result.answer,
            text: result.answer
        };
    }

    if (result.type === 'visualization_answer') {
        return {
            ...result,
            type: 'visualization_answer',
            data: result.results,
            message: result.answer,
            text: result.answer,
            vizBlueprint: result.visualizationSpec ? {
                type: result.visualizationSpec.chartType,
                title: result.visualizationSpec.title,
                xAxis: result.visualizationSpec.xField,
                yAxis: result.visualizationSpec.yFields
            } : null
        };
    }

    if (result.type === 'text_answer') {
        return {
            ...result,
            message: result.answer,
            text: result.answer
        };
    }

    if (result.type === 'failure') {
        return {
            ...result,
            message: result.userMessage,
            text: result.userMessage
        };
    }

    return result;
}

export class ResilientAIPipeline {
    constructor({
        onProgress = async () => { },
        requestId = null,
        ai = aiClient,
        toolService = spreadsheetToolService,
        visualizationAnalyzer = VisualizationAnalyzer,
        intentRouter = new IntentRouter(),
        sourceSelector = new SourceSelector(),
        structuredContextBuilder = new StructuredContextBuilder(),
        textContextBuilder = new TextContextBuilder(),
        executionPlanner = new ExecutionPlanner({ aiClient: ai }),
        toolExecutor = new PipelineToolExecutor({ spreadsheetToolService: toolService, onProgress }),
        synthesizer = new EvidenceSynthesizer({ aiClient: ai }),
        contextResolver = OneContext,
        conversationState = ConversationState
    } = {}) {
        this.onProgress = onProgress;
        this.requestId = requestId;
        this.aiClient = ai;
        this.toolService = toolService;
        this.visualizationAnalyzer = visualizationAnalyzer;
        this.intentRouter = intentRouter;
        this.sourceSelector = sourceSelector;
        this.structuredContextBuilder = structuredContextBuilder;
        this.textContextBuilder = textContextBuilder;
        this.executionPlanner = executionPlanner;
        this.toolExecutor = toolExecutor;
        this.synthesizer = synthesizer;
        this.contextResolver = contextResolver;
        this.conversationState = conversationState;
    }

    async run({
        userId,
        prompt,
        connectionId,
        activeTable,
        adHocSchema,
        modelId,
        chatId,
        conversationContext,
        forceVisualization = false,
        forceQuery = false,
        forceText = false,
        forceAnalysis = false
    }) {
        const structuredContexts = [];

        try {
            await this.onProgress(10, 'Resolving candidate sources...');
            const resolvedResources = await this.contextResolver.resolveContext(prompt, userId, connectionId);
            const forcedInstructions = new Set(
                resolvedResources
                    .filter((resource) => resource?.type === 'instruction' && resource.instruction)
                    .map((resource) => resource.instruction)
            );

            if (forcedInstructions.has('FORCE_INTENT_VISUALIZATION')) {
                forceVisualization = true;
                forceText = false;
            }
            if (forcedInstructions.has('FORCE_INTENT_QUERY')) {
                forceQuery = true;
                forceText = false;
            }
            if (forcedInstructions.has('FORCE_INTENT_ANALYSIS')) {
                forceAnalysis = true;
                forceText = false;
            }
            if (forcedInstructions.has('FORCE_INTENT_SUMMARY')) {
                forceText = true;
            }

            const sourceCandidates = await this.sourceSelector.createCandidates({
                userId,
                connectionId,
                resolvedResources
            });

            const intent = await this.intentRouter.route({
                prompt,
                modelId,
                userId,
                conversationContext,
                sourceCandidates,
                forceVisualization,
                forceQuery,
                forceText,
                forceAnalysis
            });

            logPipelineDebug('[ResilientAIPipeline] Intent selected', {
                requestId: this.requestId,
                context: 'pipeline',
                type: intent.type,
                confidence: intent.confidence
            });

            await this.onProgress(18, 'Selecting the best sources...');
            const selectedSources = this.sourceSelector.selectSources({
                prompt,
                intent,
                candidates: sourceCandidates
            });

            logPipelineDebug('[ResilientAIPipeline] Sources selected', {
                requestId: this.requestId,
                context: 'pipeline',
                primary: selectedSources.primarySource?.title || null,
                secondary: selectedSources.secondarySource?.title || null,
                confidence: selectedSources.confidence
            });

            const clarificationAlreadyAsked = chatId
                ? await this.conversationState.hasClarificationBeenAsked(chatId)
                : false;
            const conversationCarryover = this.conversationState.buildCarryover(conversationContext);

            await this.onProgress(24, 'Building focused context...');
            if (selectedSources.primarySource?.capabilities?.isStructured) {
                structuredContexts.push(await this.structuredContextBuilder.build({
                    userId,
                    sourceCandidate: selectedSources.primarySource,
                    prompt,
                    activeTable,
                    adHocSchema,
                    modelId
                }));
            }

            if (selectedSources.secondarySource?.capabilities?.isStructured) {
                structuredContexts.push(await this.structuredContextBuilder.build({
                    userId,
                    sourceCandidate: selectedSources.secondarySource,
                    prompt,
                    activeTable,
                    adHocSchema,
                    modelId
                }));
            }

            const textContext = await this.textContextBuilder.build({
                prompt,
                selectedSources: [selectedSources.primarySource, selectedSources.secondarySource].filter(Boolean)
            });

            await this.onProgress(32, 'Planning execution...');
            const plan = await this.executionPlanner.createPlan({
                prompt,
                intent,
                selectedSources,
                structuredContext: structuredContexts[0] || null,
                textContext,
                conversationCarryover,
                modelId,
                userId,
                clarificationAlreadyAsked
            });

            logPipelineDebug('[ResilientAIPipeline] Plan created', {
                requestId: this.requestId,
                context: 'pipeline',
                requiresClarification: plan.requiresClarification,
                steps: plan.steps?.map((step) => step.type) || []
            });

            if (plan.requiresClarification) {
                return {
                    type: 'clarification',
                    question: plan.clarificationQuestion,
                    reason: 'Low source selection confidence',
                    options: plan.clarificationOptions || selectedSources.clarificationOptions,
                    clarificationMode: plan.clarificationMode || 'select_source',
                    sourceTitle: plan.sourceTitle || selectedSources.primarySource?.title || null,
                    confidence: plan.confidence
                };
            }

            const executionState = await this.toolExecutor.execute(plan, {
                userId,
                prompt,
                intent,
                selectedSources,
                structuredContexts: structuredContexts.filter(Boolean),
                textContext,
                conversationCarryover
            });

            await this.onProgress(88, 'Synthesizing grounded answer...');
            const synthesis = await this.synthesizer.synthesize({
                prompt,
                intent,
                executionState,
                selectedSources,
                modelId,
                userId
            });

            const finalRows = executionState.mergedResults || executionState.queryResults[0]?.rows || [];
            let finalResult;
            const refinementSuggestions = buildRefinementSuggestions({
                intent,
                selectedSources,
                rows: Array.isArray(finalRows) ? finalRows : [],
                hasTextEvidence: executionState.excerpts.length > 0,
                query: executionState.finalQuery
            });

            if (intent.wantsVisualization && Array.isArray(finalRows) && finalRows.length > 0) {
                let visualizationSpec = null;
                try {
                    const visualization = await this.visualizationAnalyzer.analyze(
                        prompt,
                        finalRows,
                        modelId,
                        userId,
                        true
                    );
                    visualizationSpec = buildVisualizationSpec(visualization?.blueprint);
                } catch (error) {
                    logger.warn('[ResilientAIPipeline] Visualization generation failed', {
                        requestId: this.requestId,
                        context: 'pipeline',
                        message: error.message
                    });
                }

                if (visualizationSpec) {
                    finalResult = {
                        type: 'visualization_answer',
                        answer: synthesis.answer,
                        results: finalRows,
                        query: executionState.finalQuery,
                        visualizationSpec,
                        sources: synthesis.sources,
                        confidence: synthesis.confidence,
                        assumptions: synthesis.assumptions,
                        refinementSuggestions
                    };
                }
            }

            if (!finalResult && Array.isArray(finalRows) && executionState.queryResults.length > 0) {
                finalResult = {
                    type: 'data_answer',
                    answer: synthesis.answer,
                    results: finalRows,
                    query: executionState.finalQuery,
                    sources: synthesis.sources,
                    confidence: synthesis.confidence,
                    assumptions: synthesis.assumptions,
                    refinementSuggestions
                };
            }

            if (!finalResult && synthesis.answer) {
                finalResult = {
                    type: 'text_answer',
                    answer: synthesis.answer,
                    sources: synthesis.sources,
                    confidence: synthesis.confidence,
                    assumptions: synthesis.assumptions,
                    refinementSuggestions
                };
            }

            if (!finalResult) {
                finalResult = {
                    type: 'failure',
                    userMessage: 'I could not assemble enough grounded evidence to answer this request.',
                    errorCode: 'EMPTY_RESULT',
                    recoverable: true,
                    suggestedNextStep: 'Try narrowing the source or asking a more specific question.'
                };
            }

            return toLegacyAnswerShape(finalResult);
        } catch (error) {
            logger.error('[ResilientAIPipeline] Failed', {
                requestId: this.requestId,
                context: 'pipeline',
                message: error.message,
                stack: error.stack
            });

            return {
                type: 'failure',
                userMessage: `I hit a grounded execution error: ${error.message}`,
                errorCode: 'QUERY_EXECUTION_FAILED',
                recoverable: true,
                suggestedNextStep: 'Try retrying, choosing a more specific source, or narrowing the request.',
                message: `I hit a grounded execution error: ${error.message}`,
                text: `I hit a grounded execution error: ${error.message}`
            };
        } finally {
            for (const context of structuredContexts.filter(Boolean)) {
                await context.contextData?.adapter?.disconnect?.().catch(() => { });
                for (const extra of context.contextData?.extraAdapters || []) {
                    await extra.disconnect?.().catch(() => { });
                }
            }
        }
    }
}
