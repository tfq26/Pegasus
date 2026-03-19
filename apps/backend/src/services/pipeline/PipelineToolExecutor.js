function pickRows(result) {
    if (Array.isArray(result?.data)) return result.data;
    if (Array.isArray(result?.rows)) return result.rows;
    if (Array.isArray(result?.results)) return result.results;
    return [];
}

function clipRows(rows, maxRows = 40, maxColumns = 8) {
    return (rows || []).slice(0, maxRows).map((row) => {
        const entries = Object.entries(row || {}).slice(0, maxColumns);
        return Object.fromEntries(entries);
    });
}

export class PipelineToolExecutor {
    constructor({ spreadsheetToolService, onProgress = async () => { } } = {}) {
        this.spreadsheetToolService = spreadsheetToolService;
        this.onProgress = onProgress;
    }

    async execute(plan, runtime) {
        const executionState = {
            requestSummary: runtime.intent?.requestSummary || runtime.prompt,
            intent: runtime.intent,
            selectedSources: runtime.selectedSources,
            schemaSummary: runtime.structuredContexts.map((context) => ({
                sourceId: context.source.id,
                summary: context.summary
            })),
            conversationCarryover: runtime.conversationCarryover,
            evidence: [],
            openQuestions: [],
            schemaInspections: [],
            samples: [],
            queryResults: [],
            excerpts: [],
            mergedResults: null,
            finalQuery: null,
            metrics: {
                toolCalls: [],
                fallbackReasons: []
            }
        };

        for (let index = 0; index < plan.steps.length; index++) {
            const step = plan.steps[index];
            await this.onProgress(45 + Math.min(40, index * 8), `Executing ${step.type}...`);
            const startedAt = Date.now();

            try {
                if (step.type === 'inspect_schema') {
                    const result = await this._callStructuredTool('get_table_schema', { tableName: step.tableName }, step.sourceId, runtime);
                    executionState.schemaInspections.push({
                        sourceId: step.sourceId,
                        tableName: step.tableName,
                        columns: result.columns || []
                    });
                } else if (step.type === 'sample_data') {
                    const result = await this._callStructuredTool('get_sample_data', {
                        tableName: step.tableName,
                        limit: step.limit || 5
                    }, step.sourceId, runtime);
                    executionState.samples.push({
                        sourceId: step.sourceId,
                        tableName: step.tableName,
                        rows: clipRows(result.rows || [], 10, 8)
                    });
                } else if (step.type === 'query_data') {
                    const result = await this._callStructuredTool('query_data', step.intent || {}, step.sourceId, runtime);
                    const rows = pickRows(result);
                    executionState.queryResults.push({
                        sourceId: step.sourceId,
                        query: result.query || null,
                        rows: clipRows(rows, 40, 8),
                        rowCount: Array.isArray(rows) ? rows.length : 0
                    });
                    executionState.finalQuery = result.query || executionState.finalQuery;
                    executionState.evidence.push({
                        type: 'query_result',
                        sourceId: step.sourceId,
                        query: result.query || null,
                        rows: clipRows(rows, 40, 8)
                    });
                } else if (step.type === 'search_text') {
                    const excerpts = this._searchText(step.sourceId, step.query, runtime.textContext?.excerpts || []);
                    executionState.excerpts.push(...excerpts);
                    executionState.evidence.push({
                        type: 'text_search',
                        sourceId: step.sourceId,
                        excerpts
                    });
                } else if (step.type === 'summarize_unstructured') {
                    const excerpts = executionState.excerpts.filter((excerpt) => excerpt.sourceId === step.sourceId);
                    executionState.evidence.push({
                        type: 'text_summary',
                        sourceId: step.sourceId,
                        excerpts
                    });
                } else if (step.type === 'merge_results') {
                    executionState.mergedResults = this._mergeQueryResults(executionState.queryResults, runtime.selectedSources.candidates);
                }
            } finally {
                executionState.metrics.toolCalls.push({
                    type: step.type,
                    sourceId: step.sourceId,
                    durationMs: Date.now() - startedAt
                });
            }
        }

        return executionState;
    }

    async _callStructuredTool(name, args, sourceId, runtime) {
        const structuredContext = runtime.structuredContexts.find((context) => context.source.id === sourceId);
        if (!structuredContext) {
            throw new Error(`Structured context not found for source ${sourceId}`);
        }

        return this.spreadsheetToolService.callTool(name, args, {
            adapter: structuredContext.contextData.adapter,
            dialect: structuredContext.contextData.provider,
            schema: structuredContext.contextData.normalizedSchema,
            connectionId: structuredContext.source.id,
            userId: runtime.userId,
            activeTable: structuredContext.summary.defaultTable,
            resourceToAdapter: structuredContext.contextData.resourceToAdapter,
            resourceToProvider: structuredContext.contextData.resourceToProvider
        });
    }

    _searchText(sourceId, query, excerpts) {
        const terms = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
        return excerpts
            .filter((excerpt) => excerpt.sourceId === sourceId)
            .map((excerpt) => {
                const matchCount = terms.reduce((count, term) => count + (excerpt.excerpt.toLowerCase().includes(term) ? 1 : 0), 0);
                return { ...excerpt, matchCount };
            })
            .sort((a, b) => b.matchCount - a.matchCount)
            .slice(0, 2);
    }

    _mergeQueryResults(queryResults, candidates = []) {
        const rows = [];
        for (const result of queryResults) {
            const candidate = candidates.find((entry) => entry.id === result.sourceId);
            const label = candidate?.title || result.sourceId;
            for (const row of result.rows || []) {
                rows.push({ source: label, ...row });
            }
        }
        return clipRows(rows, 40, 8);
    }
}
