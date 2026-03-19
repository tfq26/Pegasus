import { parseJsonBlock } from '../../v2/utils/json.js';
import { SummaryPlanningService } from '../../v2/services/SummaryPlanningService.js';

const ALLOWED_STEP_TYPES = new Set([
    'inspect_schema',
    'sample_data',
    'query_data',
    'search_text',
    'summarize_unstructured',
    'merge_results'
]);

function stripToBudget(value, maxChars) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function mapAggregationPlanToIntent(plan) {
    const intent = {
        resource: plan.table,
        filters: (plan.filters || []).map((filter) => ({
            field: filter.column,
            op: ({
                '=': 'eq',
                '!=': 'neq',
                '>': 'gt',
                '<': 'lt',
                '>=': 'gte',
                '<=': 'lte'
            })[filter.operator] || 'eq',
            value: filter.value
        })),
        groupBy: plan.dimensions || [],
        aggregations: (plan.metrics || []).map((metric) => ({
            op: metric.aggregation,
            field: metric.column,
            alias: metric.alias
        })),
        orderBy: (plan.orderBy || []).map((entry) => ({
            field: entry.column,
            direction: entry.direction
        })),
        limit: plan.limit || 25
    };

    if (plan.query) {
        intent.query = plan.query;
    }

    return intent;
}

function looksLikeRawListing(prompt) {
    const lower = String(prompt || '').toLowerCase();
    return /\b(list|show|display|get|find)\b/.test(lower) &&
        !/\b(sum|total|count|average|avg|min|max|highest|lowest|top|bottom|chart|graph|plot|compare|versus|vs)\b/.test(lower);
}

function chooseBestTable(structuredContext) {
    return structuredContext?.summary?.tables?.[0]?.name || structuredContext?.summary?.defaultTable || null;
}

function slugify(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function promptReferencesStructuredTable(prompt, structuredContext) {
    const promptSlug = slugify(prompt);
    return (structuredContext?.summary?.tables || []).some((table) => {
        const tableSlug = slugify(table.name);
        return tableSlug && promptSlug.includes(tableSlug);
    });
}

function resolveColumnName(columns = [], requestedName) {
    const requestedSlug = slugify(requestedName);
    const exact = columns.find((column) => slugify(column.name) === requestedSlug);
    if (exact) return exact.name;
    return columns.find((column) => {
        const columnSlug = slugify(column.name);
        return columnSlug.includes(requestedSlug) || requestedSlug.includes(columnSlug);
    })?.name || null;
}

function parseQueryCarryover(query) {
    const sql = String(query || '').trim();
    if (!sql) return null;

    const tableMatch = sql.match(/FROM\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
    const groupByMatch = sql.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const orderByMatch = sql.match(/ORDER\s+BY\s+["`]?([a-zA-Z0-9_]+)["`]?\s*(ASC|DESC)?/i);
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    const aggregateMatch = sql.match(/\b(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*["`]?([a-zA-Z0-9_*]+)["`]?\s*\)\s+AS\s+["`]?([a-zA-Z0-9_]+)["`]?/i);
    const whereClause = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i)?.[1] || '';

    const filters = [];
    for (const condition of whereClause.split(/\s+AND\s+/i).map((part) => part.trim()).filter(Boolean)) {
        const parsed = condition.match(/["`]?([a-zA-Z0-9_]+)["`]?\s*(=|!=|>=|<=|>|<)\s*'([^']+)'/i)
            || condition.match(/["`]?([a-zA-Z0-9_]+)["`]?\s*(=|!=|>=|<=|>|<)\s*([0-9.]+)/i);
        if (parsed) {
            filters.push({
                field: parsed[1],
                op: ({
                    '=': 'eq',
                    '!=': 'neq',
                    '>': 'gt',
                    '<': 'lt',
                    '>=': 'gte',
                    '<=': 'lte'
                })[parsed[2]] || 'eq',
                value: parsed[3]
            });
        }
    }

    return {
        table: tableMatch?.[1] || null,
        groupBy: groupByMatch
            ? groupByMatch[1].split(',').map((entry) => entry.trim().replace(/["`]/g, '')).filter(Boolean)
            : [],
        aggregate: aggregateMatch ? {
            op: aggregateMatch[1].toLowerCase(),
            field: aggregateMatch[2],
            alias: aggregateMatch[3]
        } : null,
        orderBy: orderByMatch ? {
            field: orderByMatch[1],
            direction: (orderByMatch[2] || 'DESC').toLowerCase()
        } : null,
        limit: limitMatch ? Number(limitMatch[1]) : null,
        filters
    };
}

function createFollowUpStructuredStep({ prompt, primarySource, structuredContext, conversationCarryover }) {
    const lower = String(prompt || '').toLowerCase().trim();
    const parsedCarryover = parseQueryCarryover(conversationCarryover?.lastQuery);
    const tableSummary = structuredContext?.summary?.tables?.find((table) => table.name === (parsedCarryover?.table || structuredContext?.summary?.defaultTable))
        || structuredContext?.summary?.tables?.[0];
    const tableName = tableSummary?.name || parsedCarryover?.table || structuredContext?.summary?.defaultTable || null;

    if (!primarySource?.id || !tableName || !tableSummary) return null;

    const columns = tableSummary.columns || [];
    const inheritedMetric = parsedCarryover?.aggregate || null;
    const inheritedFilters = Array.isArray(parsedCarryover?.filters) ? parsedCarryover.filters : [];

    const breakdownMatch = lower.match(/^break\s+this\s+down\s+by\s+([a-zA-Z0-9_]+)/i);
    if (breakdownMatch) {
        const groupBy = resolveColumnName(columns, breakdownMatch[1]) || breakdownMatch[1];
        const metricField = resolveColumnName(columns, inheritedMetric?.field || '') || inheritedMetric?.field || tableSummary.numericColumns?.[0] || '*';
        const metricOp = inheritedMetric?.op || (metricField === '*' ? 'count' : 'max');
        const metricAlias = inheritedMetric?.alias || `${metricOp}_${String(metricField).replace('*', 'rows')}`;

        return {
            type: 'query_data',
            sourceId: primarySource.id,
            intent: {
                resource: tableName,
                filters: inheritedFilters,
                groupBy: [groupBy],
                aggregations: [{ op: metricOp, field: metricField, alias: metricAlias }],
                orderBy: [{ field: metricAlias, direction: 'desc' }],
                limit: 10
            }
        };
    }

    const topOutliersMatch = lower.match(/^(?:show|focus\s+on)\s+(?:the\s+)?top\s+(\d+)\s+([a-zA-Z0-9_]+)\s+outliers/i);
    const genericOutliersMatch = /^focus\s+on\s+the\s+top\s+outliers/i.test(lower);
    if (topOutliersMatch || genericOutliersMatch) {
        const requestedLimit = topOutliersMatch ? Number(topOutliersMatch[1]) : 5;
        const requestedEntity = topOutliersMatch ? topOutliersMatch[2] : null;
        const existingGroup = requestedEntity || parsedCarryover?.groupBy?.[0];
        const entityColumn = resolveColumnName(columns, existingGroup || '')
            || resolveColumnName(columns, 'serverId')
            || resolveColumnName(columns, 'serverName')
            || columns.find((column) => !(tableSummary.numericColumns || []).includes(column.name))?.name;
        const metricField = resolveColumnName(columns, inheritedMetric?.field || '') || inheritedMetric?.field || tableSummary.numericColumns?.[0] || '*';
        const metricOp = inheritedMetric?.op || (metricField === '*' ? 'count' : 'max');
        const metricAlias = inheritedMetric?.alias || `${metricOp}_${String(metricField).replace('*', 'rows')}`;

        if (!entityColumn) return null;

        return {
            type: 'query_data',
            sourceId: primarySource.id,
            intent: {
                resource: tableName,
                filters: inheritedFilters,
                groupBy: [entityColumn],
                aggregations: [{ op: metricOp, field: metricField, alias: metricAlias }],
                orderBy: [{ field: metricAlias, direction: 'desc' }],
                limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 5
            }
        };
    }

    return null;
}

function preferDeterministicStructuredPlan({ prompt, intent, selectedSources, structuredContext }) {
    const primarySource = selectedSources?.primarySource;
    if (!intent?.needsStructured || !primarySource?.capabilities?.isStructured) return false;
    if (!structuredContext?.summary?.tables?.length) return false;

    const structuredCandidates = (selectedSources?.candidates || []).filter((candidate) => candidate.capabilities?.isStructured);
    return primarySource.isActiveConnection
        || primarySource.method === 'explicit'
        || primarySource.promptMatched
        || promptReferencesStructuredTable(prompt, structuredContext)
        || ((selectedSources?.confidence || 0) >= 0.75 && !selectedSources?.secondarySource)
        || selectedSources?.selectionMode === 'single_candidate'
        || selectedSources?.selectionMode === 'single_structured_candidate'
        || structuredCandidates.length <= 1;
}

function buildClarificationDetails(selectedSources) {
    const availableOptions = selectedSources?.clarificationOptions || [];

    if (availableOptions.length === 1) {
        const sourceTitle = availableOptions[0];
        return {
            clarificationQuestion: `I found a likely data source: ${sourceTitle}. Should I use it?`,
            clarificationMode: 'confirm_source',
            clarificationOptions: ['Yes', 'No'],
            sourceTitle
        };
    }

    return {
        clarificationQuestion: availableOptions.length > 0
            ? `I found a few possible data sources: ${availableOptions.join(', ')}. Which one should I use?`
            : 'Which data source should I use for this request?',
        clarificationMode: 'select_source',
        clarificationOptions: availableOptions,
        sourceTitle: null
    };
}

function canProceedWithoutClarification({ selectedSources, structuredContext, textContext }) {
    const primarySource = selectedSources?.primarySource;
    if (!primarySource) return false;
    if (primarySource.isActiveConnection) return true;
    if (primarySource.capabilities?.isStructured && structuredContext?.summary?.tables?.length) return true;
    if (primarySource.capabilities?.isUnstructured && (textContext?.excerpts?.length || 0) > 0) return true;
    return false;
}

export class ExecutionPlanner {
    constructor({ aiClient, summaryPlanningService = new SummaryPlanningService() } = {}) {
        this.aiClient = aiClient;
        this.summaryPlanningService = summaryPlanningService;
    }

    async createPlan({
        prompt,
        intent,
        selectedSources,
        structuredContext,
        textContext,
        conversationCarryover,
        modelId,
        userId,
        clarificationAlreadyAsked = false
    }) {
        const sourceBindings = [selectedSources.primarySource, selectedSources.secondarySource]
            .filter(Boolean)
            .map((source, index) => ({
                sourceId: source.id,
                role: index === 0 ? 'primary' : 'secondary'
            }));

        const shouldProceedWithBestGuess = canProceedWithoutClarification({
            selectedSources,
            structuredContext,
            textContext
        });

        if (selectedSources.requiresClarification && !clarificationAlreadyAsked && !shouldProceedWithBestGuess) {
            const clarification = buildClarificationDetails(selectedSources);
            return {
                goal: prompt,
                sourceBindings,
                steps: [],
                requiresClarification: true,
                clarificationQuestion: clarification.clarificationQuestion,
                clarificationMode: clarification.clarificationMode,
                clarificationOptions: clarification.clarificationOptions,
                sourceTitle: clarification.sourceTitle,
                confidence: selectedSources.confidence || 0.5,
                expectedOutput: 'clarification'
            };
        }

        if (preferDeterministicStructuredPlan({ prompt, intent, selectedSources, structuredContext })) {
            return this._createFallbackPlan({
                prompt,
                intent,
                structuredContext,
                textContext,
                selectedSources,
                sourceBindings,
                conversationCarryover,
                clarificationAlreadyAsked: true
            });
        }

        const aiPlan = await this._createAiPlan({
            prompt,
            intent,
            selectedSources,
            structuredContext,
            textContext,
            conversationCarryover,
            modelId,
            userId,
            clarificationAlreadyAsked
        });

        if (aiPlan) {
            if (aiPlan.requiresClarification && shouldProceedWithBestGuess) {
                return this._createFallbackPlan({
                    prompt,
                    intent,
                    structuredContext,
                    textContext,
                    selectedSources,
                    sourceBindings,
                    conversationCarryover,
                    clarificationAlreadyAsked: true
                });
            }
            return {
                ...aiPlan,
                goal: aiPlan.goal || prompt,
                sourceBindings: aiPlan.sourceBindings?.length ? aiPlan.sourceBindings : sourceBindings,
                expectedOutput: aiPlan.expectedOutput || (intent.wantsVisualization ? 'visualization_answer' : (intent.needsStructured ? 'data_answer' : 'text_answer'))
            };
        }

        return this._createFallbackPlan({
            prompt,
            intent,
            structuredContext,
            textContext,
            selectedSources,
            sourceBindings,
            conversationCarryover,
            clarificationAlreadyAsked
        });
    }

    async _createAiPlan({
        prompt,
        intent,
        selectedSources,
        structuredContext,
        textContext,
        conversationCarryover,
        modelId,
        userId,
        clarificationAlreadyAsked
    }) {
        if (!this.aiClient || (!structuredContext && (!textContext?.excerpts || textContext.excerpts.length === 0))) {
            return null;
        }

        const plannerInput = {
            prompt,
            intent: {
                type: intent.type,
                wantsVisualization: intent.wantsVisualization,
                needsStructured: intent.needsStructured,
                needsText: intent.needsText
            },
            selectedSources: [selectedSources.primarySource, selectedSources.secondarySource]
                .filter(Boolean)
                .map((source) => ({
                    id: source.id,
                    title: source.title,
                    provider: source.provider,
                    capabilities: source.capabilities
                })),
            structuredContext: structuredContext ? {
                defaultTable: structuredContext.summary.defaultTable,
                tables: structuredContext.summary.tables,
                additionalTables: structuredContext.summary.additionalTables
            } : null,
            textContext: {
                excerpts: (textContext?.excerpts || []).slice(0, 2).map((excerpt) => ({
                    ...excerpt,
                    excerpt: stripToBudget(excerpt.excerpt, 500)
                }))
            },
            conversationCarryover,
            clarificationAlreadyAsked
        };

        try {
            const response = await this.aiClient.generateContent([
                {
                    role: 'system',
                    content: [
                        'You are a planning engine for a grounded analytics pipeline.',
                        'Return JSON only.',
                        'Allowed step types: inspect_schema, sample_data, query_data, search_text, summarize_unstructured, merge_results.',
                        'Use query_data for structured retrieval and search_text for notes/docs.',
                        'Never assume an unstructured note can answer numeric questions.',
                        'If confidence is too low and clarification has not already been asked, return {"requiresClarification":true,"clarificationQuestion":"...","confidence":0.6,"steps":[]}.'
                    ].join(' ')
                },
                { role: 'user', content: JSON.stringify(plannerInput, null, 2) }
            ], { model: modelId, userId, json: true });

            const parsed = parseJsonBlock(response?.text || response);
            if (!parsed) return null;
            return this._validatePlan(parsed, plannerInput.selectedSources.map((source) => source.id));
        } catch {
            return null;
        }
    }

    _validatePlan(plan, allowedSourceIds) {
        const steps = Array.isArray(plan.steps) ? plan.steps.filter((step) => ALLOWED_STEP_TYPES.has(step?.type)) : [];
        const sourceBindings = Array.isArray(plan.sourceBindings)
            ? plan.sourceBindings.filter((binding) => allowedSourceIds.includes(binding.sourceId))
            : [];

        if (plan.requiresClarification) {
            return {
                goal: plan.goal,
                sourceBindings,
                steps: [],
                requiresClarification: true,
                clarificationQuestion: plan.clarificationQuestion || 'Which source should I use for this request?',
                clarificationMode: plan.clarificationMode || 'select_source',
                clarificationOptions: Array.isArray(plan.clarificationOptions) ? plan.clarificationOptions : [],
                sourceTitle: plan.sourceTitle || null,
                confidence: plan.confidence || 0.6,
                expectedOutput: 'clarification'
            };
        }

        if (steps.length === 0) return null;
        return {
            goal: plan.goal,
            sourceBindings,
            steps,
            requiresClarification: false,
            expectedOutput: plan.expectedOutput,
            confidence: plan.confidence || 0.8
        };
    }

    _createFallbackPlan({
        prompt,
        intent,
        structuredContext,
        textContext,
        selectedSources,
        sourceBindings,
        conversationCarryover,
        clarificationAlreadyAsked
    }) {
        const steps = [];
        const primary = selectedSources.primarySource;
        const secondary = selectedSources.secondarySource;
        const bestTable = chooseBestTable(structuredContext);
        const primaryDetailedTable = structuredContext?.summary?.tables?.find((table) => table.name === bestTable) || structuredContext?.summary?.tables?.[0];
        const followUpStep = createFollowUpStructuredStep({
            prompt,
            primarySource: primary,
            structuredContext,
            conversationCarryover
        });

        if (followUpStep) {
            steps.push(followUpStep);
        }

        if (steps.length === 0 && intent.needsStructured && primary?.capabilities?.isStructured && bestTable) {
            if (primaryDetailedTable?.hasGenericHeaders) {
                steps.push({ type: 'sample_data', sourceId: primary.id, tableName: bestTable, limit: 5 });
            }

            if (looksLikeRawListing(prompt)) {
                steps.push({
                    type: 'query_data',
                    sourceId: primary.id,
                    intent: {
                        resource: bestTable,
                        limit: intent.wantsVisualization ? 50 : 25
                    }
                });
            } else {
                const summaryPlan = this.summaryPlanningService.createHeuristicPlan({
                    prompt,
                    catalog: {
                        tables: (structuredContext?.summary?.tables || []).map((table) => ({
                            name: table.name,
                            columns: table.columns,
                            numericColumns: table.numericColumns
                        }))
                    },
                    tableHint: structuredContext?.summary?.defaultTable
                });

                steps.push({
                    type: 'query_data',
                    sourceId: primary.id,
                    intent: mapAggregationPlanToIntent(summaryPlan)
                });
            }
        }

        if (intent.needsText && secondary?.capabilities?.isUnstructured) {
            steps.push({ type: 'search_text', sourceId: secondary.id, query: prompt });
            steps.push({ type: 'summarize_unstructured', sourceId: secondary.id });
        } else if (!intent.needsStructured && textContext?.excerpts?.length > 0 && primary?.capabilities?.isUnstructured) {
            steps.push({ type: 'search_text', sourceId: primary.id, query: prompt });
            steps.push({ type: 'summarize_unstructured', sourceId: primary.id });
        }

        if (intent.type === 'comparison' && secondary?.capabilities?.isStructured && bestTable) {
            steps.push({
                type: 'query_data',
                sourceId: secondary.id,
                intent: {
                    resource: bestTable,
                    limit: 25
                }
            });
            steps.push({ type: 'merge_results', sourceId: primary.id });
        }

        if (steps.length === 0 && !clarificationAlreadyAsked) {
            if (primary?.capabilities?.isStructured && bestTable) {
                steps.push({
                    type: 'query_data',
                    sourceId: primary.id,
                    intent: {
                        resource: bestTable,
                        limit: 25
                    }
                });
            }
        }

        if (steps.length === 0 && !clarificationAlreadyAsked) {
            return {
                goal: prompt,
                sourceBindings,
                steps: [],
                requiresClarification: true,
                clarificationQuestion: 'I can see possible sources, but I cannot safely determine how to answer this request. Which source should I use?',
                clarificationMode: 'select_source',
                clarificationOptions: selectedSources.clarificationOptions || [],
                sourceTitle: null,
                confidence: 0.6,
                expectedOutput: 'clarification'
            };
        }

        return {
            goal: prompt,
            sourceBindings,
            steps,
            requiresClarification: false,
            expectedOutput: intent.wantsVisualization ? 'visualization_answer' : (intent.needsStructured ? 'data_answer' : 'text_answer'),
            confidence: selectedSources.confidence || 0.8
        };
    }
}
