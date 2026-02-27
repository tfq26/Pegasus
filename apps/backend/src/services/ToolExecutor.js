/**
 * ToolExecutor
 * 
 * Manages the execution of AI tool calls, handles resource-to-adapter mapping,
 * and formats tool results.
 */
export class ToolExecutor {
    constructor(dependencies) {
        this.spreadsheetToolService = dependencies.spreadsheetToolService;
        this.context = dependencies.context;
    }

    /**
     * Executes a batch of tool calls.
     * 
     * @param {Array} toolCalls - Array of tool call objects from the AI.
     * @returns {Promise<Array>} Array of results.
     */
    async executeBatch(toolCalls) {
        return Promise.all(toolCalls.map(tc => this.executeSingle(tc)));
    }

    /**
     * Executes a single tool call with resource resolution.
     */
    async executeSingle(toolCall) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        const resourceName = args.resource || args.tableName;

        const { adapter, provider, normalizedSchema, connectionId, userId, activeTable } = this.context;

        // 1. Resolve Target Adapter & Provider
        const { targetAdapter, targetProvider } = this._resolveTarget(resourceName);

        // 2. Intercept special cases (e.g. Unstructured/Notes)
        const intercepted = this._interceptSpecial(toolName, resourceName, args);
        if (intercepted) return intercepted;

        // 3. Execute Tool via SpreadsheetToolService
        const res = await this.spreadsheetToolService.callTool(toolName, args, {
            adapter: targetAdapter,
            dialect: targetProvider,
            schema: normalizedSchema,
            connectionId,
            userId,
            activeTable
        });

        return { ...res, resource: resourceName, intent: args };
    }

    /**
     * Internal: Resolves the appropriate adapter/provider for a resource.
     */
    _resolveTarget(resourceName) {
        const { adapter, provider, resourceToAdapter, resourceToProvider } = this.context;
        if (!resourceName) return { targetAdapter: adapter, targetProvider: provider };

        const slug = resourceName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const underscoreSlug = resourceName.toLowerCase().replace(/[^a-z0-9_]/g, '');

        let targetAdapter = resourceToAdapter[resourceName] || resourceToAdapter[slug] || resourceToAdapter[underscoreSlug];
        let targetProvider = resourceToProvider[resourceName] || resourceToProvider[slug] || resourceToProvider[underscoreSlug];

        if (!targetAdapter && slug) {
            const candidates = Object.keys(resourceToAdapter);
            const bestMatch = candidates.find(c => slug.includes(c) || c.includes(slug));
            if (bestMatch) {
                targetAdapter = resourceToAdapter[bestMatch];
                targetProvider = resourceToProvider[bestMatch];
            }
        }

        return {
            targetAdapter: targetAdapter || adapter,
            targetProvider: targetProvider || provider
        };
    }

    /**
     * Internal: Handles unstructured data or other special tool behaviors.
     */
    _interceptSpecial(toolName, resourceName, args) {
        const { normalizedSchema } = this.context;
        const slug = resourceName?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const sourceRegistry = normalizedSchema.sourceRegistry || {};
        const sourceInfo = sourceRegistry[resourceName] || sourceRegistry[slug];

        if (sourceInfo && sourceInfo.type === 'UNSTRUCTURED') {
            const knowledgeBase = normalizedSchema.semanticContext?.knowledgeBase || [];
            const note = knowledgeBase.find(n => n.id === sourceInfo.id || n.source === resourceName);
            if (note) {
                if (toolName === 'get_table_schema') return { columns: [{ name: 'content', type: 'text' }] };
                if (toolName === 'get_sample_data') return { rows: [{ content: note.content.substring(0, 500) + '...' }] };
                if (toolName === 'query_data') return {
                    resource: resourceName,
                    data: [{ content: note.content }],
                    note: `Extracted content from unstructured source: ${note.source}`
                };
            }
        }
        return null;
    }
}
