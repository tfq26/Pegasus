import { describe, expect, test } from 'bun:test';
import { SourceSelector } from '../src/services/pipeline/SourceSelector.js';
import { ExecutionPlanner } from '../src/services/pipeline/ExecutionPlanner.js';
import { ResilientAIPipeline } from '../src/services/pipeline/ResilientAIPipeline.js';
import { ConversationState } from '../src/services/ConversationState.js';
import { SummaryPlanningService } from '../src/v2/services/SummaryPlanningService.js';

describe('SourceSelector', () => {
    test('prefers a structured primary source and text secondary source for mixed requests', () => {
        const selector = new SourceSelector();
        const selection = selector.selectSources({
            prompt: 'Show revenue by region and explain the drop using notes',
            intent: {
                type: 'mixed',
                needsStructured: true,
                needsText: true,
                wantsVisualization: false
            },
            candidates: [
                {
                    id: 'conn-1',
                    title: 'Revenue Warehouse',
                    provider: 'postgres',
                    method: 'active',
                    isActiveConnection: true,
                    capabilities: { isStructured: true, isUnstructured: false }
                },
                {
                    id: 'note-1',
                    title: 'Ops Notes',
                    provider: 'notes',
                    method: 'explicit',
                    isActiveConnection: false,
                    capabilities: { isStructured: false, isUnstructured: true }
                }
            ]
        });

        expect(selection.primarySource?.id).toBe('conn-1');
        expect(selection.secondarySource?.id).toBe('note-1');
    });

    test('auto-selects a single viable structured source without clarification', () => {
        const selector = new SourceSelector();
        const selection = selector.selectSources({
            prompt: 'using pegasustestcosmos, summarize orion metrics over the last 7 days',
            intent: {
                type: 'analysis',
                needsStructured: true,
                needsText: false,
                wantsVisualization: false
            },
            candidates: [
                {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    provider: 'cosmosdb',
                    method: 'implicit',
                    isActiveConnection: false,
                    capabilities: { isStructured: true, isUnstructured: false }
                }
            ]
        });

        expect(selection.primarySource?.id).toBe('conn-1');
        expect(selection.requiresClarification).toBe(false);
        expect(selection.confidence).toBeGreaterThanOrEqual(0.9);
    });
});

describe('ExecutionPlanner', () => {
    test('adds sample_data before querying tables with generic headers', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'Show me the totals from this upload',
            intent: {
                type: 'query',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'file-1',
                    title: 'Upload',
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                confidence: 0.9,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'sheet_1',
                    tables: [{
                        name: 'sheet_1',
                        columns: [{ name: 'Field1', type: 'text' }, { name: 'Field2', type: 'number' }],
                        numericColumns: ['Field2'],
                        hasGenericHeaders: true
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: null,
            clarificationAlreadyAsked: false
        });

        expect(plan.requiresClarification).toBe(false);
        expect(plan.steps[0].type).toBe('sample_data');
        expect(plan.steps[1].type).toBe('query_data');
    });

    test('prefers a best-effort plan over clarification when an active structured source is available', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'Which app server needs the most attention right now?',
            intent: {
                type: 'analysis',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    isActiveConnection: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                confidence: 0.4,
                requiresClarification: true,
                clarificationOptions: ['pegasustestcosmos']
            },
            structuredContext: {
                summary: {
                    defaultTable: 'orion_metrics',
                    tables: [{
                        name: 'orion_metrics',
                        columns: [{ name: 'server_name', type: 'text' }, { name: 'latency_ms', type: 'number' }],
                        numericColumns: ['latency_ms'],
                        hasGenericHeaders: false
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: null,
            clarificationAlreadyAsked: false
        });

        expect(plan.requiresClarification).toBe(false);
        expect(plan.steps.some((step) => step.type === 'query_data')).toBe(true);
    });

    test('uses deterministic structured planning for a single structured source', async () => {
        const planner = new ExecutionPlanner({
            aiClient: {
                async generateContent() {
                    return '{"requiresClarification":true,"clarificationQuestion":"Which source should I use?","steps":[]}'
                }
            }
        });

        const plan = await planner.createPlan({
            prompt: 'using pegasustestcosmos, summarize orion metrics over the last 7 days',
            intent: {
                type: 'analysis',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    method: 'explicit',
                    promptMatched: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                candidates: [{
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    capabilities: { isStructured: true }
                }],
                selectionMode: 'single_candidate',
                confidence: 0.95,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'OrionMetrics',
                    tables: [{
                        name: 'OrionMetrics',
                        columns: [{ name: 'timestamp', type: 'string' }, { name: 'cpuPercent', type: 'number' }],
                        numericColumns: ['cpuPercent'],
                        hasGenericHeaders: false
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: null,
            clarificationAlreadyAsked: false
        });

        expect(plan.requiresClarification).toBe(false);
        expect(plan.steps.some((step) => step.type === 'query_data')).toBe(true);
    });

    test('uses a raw time-series query for app-server visualization prompts', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'can you generate a line graph for the CPU performance on app server 2 please',
            intent: {
                type: 'visualization',
                wantsVisualization: true,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    method: 'explicit',
                    promptMatched: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                candidates: [{
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    capabilities: { isStructured: true }
                }],
                selectionMode: 'single_candidate',
                confidence: 0.95,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'OrionMetrics',
                    tables: [{
                        name: 'OrionMetrics',
                        columns: [
                            { name: 'serverId', type: 'text' },
                            { name: 'cpuPercent', type: 'number' },
                            { name: 'timestamp', type: 'string' }
                        ],
                        numericColumns: ['cpuPercent'],
                        hasGenericHeaders: false
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: null,
            clarificationAlreadyAsked: false
        });

        const queryStep = plan.steps.find((step) => step.type === 'query_data');
        expect(queryStep?.intent?.query).toContain('SELECT "timestamp", "serverId", "cpuPercent"');
        expect(queryStep?.intent?.query).toContain('"serverId" IN (');
        expect(queryStep?.intent?.query).toContain("'app-server-2'");
        expect(queryStep?.intent?.query).toContain('ORDER BY "timestamp" ASC');
    });

    test('reuses prior query context for refinement follow-ups', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'Break this down by serverId',
            intent: {
                type: 'analysis',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    method: 'explicit',
                    promptMatched: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                candidates: [{
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    capabilities: { isStructured: true }
                }],
                selectionMode: 'single_candidate',
                confidence: 0.95,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'OrionMetrics',
                    tables: [{
                        name: 'OrionMetrics',
                        columns: [{ name: 'serverId', type: 'text' }, { name: 'diskIoOps', type: 'number' }, { name: 'timestamp', type: 'string' }],
                        numericColumns: ['diskIoOps'],
                        hasGenericHeaders: false
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: {
                lastTable: 'OrionMetrics',
                lastQuery: `SELECT "serverId", MAX("diskIoOps") AS "max_disk_io_ops" FROM "OrionMetrics" WHERE "timestamp" >= '2026-03-19T05:00:00.000Z' GROUP BY "serverId"`
            },
            clarificationAlreadyAsked: false
        });

        expect(plan.requiresClarification).toBe(false);
        expect(plan.steps[0].type).toBe('query_data');
        expect(plan.steps[0].intent.groupBy).toEqual(['serverId']);
        expect(plan.steps[0].intent.aggregations[0].field).toBe('diskIoOps');
    });

    test('reuses prior query context for top-outlier refinement suggestions', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'Show the top 5 serverId outliers',
            intent: {
                type: 'analysis',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    method: 'explicit',
                    promptMatched: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                candidates: [{
                    id: 'conn-1',
                    title: 'pegasustestcosmos',
                    capabilities: { isStructured: true }
                }],
                selectionMode: 'single_candidate',
                confidence: 0.95,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'OrionMetrics',
                    tables: [{
                        name: 'OrionMetrics',
                        columns: [{ name: 'serverId', type: 'text' }, { name: 'diskIoOps', type: 'number' }, { name: 'timestamp', type: 'string' }],
                        numericColumns: ['diskIoOps'],
                        hasGenericHeaders: false
                    }],
                    additionalTables: []
                }
            },
            textContext: { excerpts: [] },
            conversationCarryover: {
                lastTable: 'OrionMetrics',
                lastQuery: `SELECT "serverId", MAX("diskIoOps") AS "max_disk_io_ops" FROM "OrionMetrics" WHERE "timestamp" >= '2026-03-19T05:00:00.000Z' GROUP BY "serverId"`
            },
            clarificationAlreadyAsked: false
        });

        expect(plan.requiresClarification).toBe(false);
        expect(plan.steps[0].type).toBe('query_data');
        expect(plan.steps[0].intent.groupBy).toEqual(['serverId']);
        expect(plan.steps[0].intent.limit).toBe(5);
        expect(plan.steps[0].intent.aggregations[0].field).toBe('diskIoOps');
    });
});

describe('ConversationState', () => {
    test('preserves grounded carryover even when follow-up detection is inconclusive', () => {
        const carryover = ConversationState.buildCarryover({
            isFollowUp: false,
            entities: {
                lastTable: 'OrionMetrics',
                lastColumns: ['serverId', 'diskIoOps'],
                lastQuery: 'SELECT "serverId", MAX("diskIoOps") AS "max_disk_io_ops" FROM "OrionMetrics" GROUP BY "serverId"',
                lastVisualization: null
            }
        });

        expect(carryover?.lastTable).toBe('OrionMetrics');
        expect(carryover?.lastQuery).toContain('MAX("diskIoOps")');
    });
});

describe('SummaryPlanningService', () => {
    test('adds a recent time filter for last-7-days Orion prompts', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'summarize orion metrics over the last 7 days',
            catalog: {
                tables: [{
                    name: 'OrionMetrics',
                    columns: [
                        { name: 'serverName' },
                        { name: 'cpuPercent' },
                        { name: 'latencyMs' },
                        { name: 'timestamp' }
                    ],
                    numericColumns: ['cpuPercent', 'latencyMs']
                }]
            },
            tableHint: 'OrionMetrics'
        });

        expect(plan.table).toBe('OrionMetrics');
        expect(plan.filters.some((filter) => filter.column === 'timestamp' && filter.operator === '>=' && typeof filter.value === 'string')).toBe(true);
        expect(plan.metrics.length).toBeGreaterThan(1);
    });

    test('groups by server for app-server attention prompts', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'which app server needs the most attention right now based on orion metrics, and why?',
            catalog: {
                tables: [{
                    name: 'OrionMetrics',
                    columns: [
                        { name: 'serverName' },
                        { name: 'diskIoOps' },
                        { name: 'cpuPercent' },
                        { name: 'timestamp' }
                    ],
                    numericColumns: ['diskIoOps', 'cpuPercent']
                }]
            },
            tableHint: 'OrionMetrics'
        });

        expect(plan.dimensions).toContain('serverName');
        expect(plan.limit).toBe(1);
        expect(plan.orderBy[0]?.direction).toBe('desc');
    });

    test('creates a time-series plan for CPU line graphs on a named app server', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'can you generate a line graph for the CPU performance on app server 2 please',
            catalog: {
                tables: [{
                    name: 'OrionMetrics',
                    columns: [
                        { name: 'serverId' },
                        { name: 'cpuPercent' },
                        { name: 'timestamp' }
                    ],
                    numericColumns: ['cpuPercent']
                }]
            },
            tableHint: 'OrionMetrics'
        });

        expect(plan.metrics).toEqual([]);
        expect(plan.query).toContain('SELECT "timestamp", "serverId", "cpuPercent"');
        expect(plan.query).toContain('"serverId" IN (');
        expect(plan.query).toContain("'app-server-2'");
        expect(plan.orderBy).toEqual([{ column: 'timestamp', direction: 'asc' }]);
    });
});

describe('ResilientAIPipeline', () => {
    test('returns a visualization answer when grounded rows are available', async () => {
        const structuredCandidate = {
            id: 'conn-1',
            title: 'Revenue Warehouse',
            provider: 'postgres',
            type: 'database',
            confidence: 0.95,
            capabilities: { isStructured: true, isUnstructured: false }
        };

        const pipeline = new ResilientAIPipeline({
            onProgress: async () => { },
            contextResolver: {
                async resolveContext() {
                    return [];
                }
            },
            conversationState: {
                async hasClarificationBeenAsked() {
                    return false;
                },
                buildCarryover() {
                    return null;
                }
            },
            sourceSelector: {
                async createCandidates() {
                    return [structuredCandidate];
                },
                selectSources() {
                    return {
                        candidates: [structuredCandidate],
                        primarySource: structuredCandidate,
                        secondarySource: null,
                        confidence: 0.95,
                        requiresClarification: false,
                        clarificationOptions: []
                    };
                }
            },
            intentRouter: {
                async route() {
                    return {
                        type: 'visualization',
                        wantsVisualization: true,
                        needsStructured: true,
                        needsText: false,
                        requestSummary: 'Show revenue by region'
                    };
                }
            },
            structuredContextBuilder: {
                async build() {
                    return {
                        source: structuredCandidate,
                        contextData: {
                            adapter: { disconnect: async () => { } },
                            extraAdapters: []
                        },
                        summary: {
                            defaultTable: 'sales',
                            tables: [{ name: 'sales', columns: [{ name: 'region', type: 'text' }, { name: 'revenue', type: 'number' }], numericColumns: ['revenue'] }],
                            additionalTables: []
                        }
                    };
                }
            },
            textContextBuilder: {
                async build() {
                    return { excerpts: [] };
                }
            },
            executionPlanner: {
                async createPlan() {
                    return {
                        goal: 'Show revenue by region',
                        sourceBindings: [{ sourceId: 'conn-1', role: 'primary' }],
                        steps: [{ type: 'query_data', sourceId: 'conn-1', intent: { resource: 'sales' } }],
                        requiresClarification: false,
                        expectedOutput: 'visualization_answer'
                    };
                }
            },
            toolExecutor: {
                async execute() {
                    return {
                        queryResults: [{
                            sourceId: 'conn-1',
                            query: 'SELECT region, SUM(revenue) AS sum_revenue FROM sales GROUP BY region',
                            rows: [{ region: 'West', sum_revenue: 4200 }]
                        }],
                        excerpts: [],
                        mergedResults: null,
                        finalQuery: 'SELECT region, SUM(revenue) AS sum_revenue FROM sales GROUP BY region',
                        schemaSummary: [],
                        metrics: { toolCalls: [] }
                    };
                }
            },
            synthesizer: {
                async synthesize() {
                    return {
                        answer: 'West generated 4200 in revenue.\n\nSources: Revenue Warehouse.',
                        confidence: 0.94,
                        assumptions: [],
                        sources: [{ id: 'conn-1', title: 'Revenue Warehouse', provider: 'postgres', type: 'database' }]
                    };
                }
            },
            visualizationAnalyzer: {
                async analyze() {
                    return {
                        blueprint: {
                            type: 'bar',
                            title: 'Revenue by Region',
                            xAxis: 'region',
                            yAxis: ['sum_revenue'],
                            reasoning: 'Grouped revenue is best shown as bars.'
                        }
                    };
                }
            }
        });

        const result = await pipeline.run({
            userId: 'user-1',
            prompt: 'Show revenue by region as a chart',
            connectionId: 'conn-1',
            activeTable: 'sales',
            modelId: 'mock'
        });

        expect(result.type).toBe('visualization_answer');
        expect(result.query).toContain('SELECT region');
        expect(result.visualizationSpec.chartType).toBe('bar');
        expect(result.results[0].sum_revenue).toBe(4200);
    });
});
