import { describe, expect, test } from 'bun:test';
import { SourceSelector } from '../src/services/pipeline/SourceSelector.js';
import { ExecutionPlanner } from '../src/services/pipeline/ExecutionPlanner.js';
import { ResilientAIPipeline } from '../src/services/pipeline/ResilientAIPipeline.js';
import { SummaryPlanningService } from '../src/v2/services/SummaryPlanningService.js';

describe('space-aware source coverage', () => {
    test('prefers the portfolio dataset for portfolio performance questions', () => {
        const selector = new SourceSelector();
        const selection = selector.selectSources({
            prompt: 'What are my top 5 holdings by market value in the portfolio space?',
            intent: {
                type: 'analysis',
                needsStructured: true,
                needsText: false,
                wantsVisualization: false
            },
            candidates: [
                {
                    id: 'portfolio-conn',
                    title: 'PortfolioGain-LossReport',
                    provider: 'duckdb',
                    method: 'explicit',
                    isActiveConnection: true,
                    capabilities: { isStructured: true, isUnstructured: false }
                },
                {
                    id: 'portfolio-notes',
                    title: 'InvestmentStrategyNotes',
                    provider: 'notes',
                    method: 'implicit',
                    isActiveConnection: false,
                    capabilities: { isStructured: false, isUnstructured: true }
                }
            ]
        });

        expect(selection.primarySource?.id).toBe('portfolio-conn');
        expect(selection.requiresClarification).toBe(false);
        expect(selection.confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('keeps structured portfolio data primary and notes secondary for mixed prompts', () => {
        const selector = new SourceSelector();
        const selection = selector.selectSources({
            prompt: 'Show my worst performing funds and explain the likely drivers using notes',
            intent: {
                type: 'mixed',
                needsStructured: true,
                needsText: true,
                wantsVisualization: false
            },
            candidates: [
                {
                    id: 'portfolio-conn',
                    title: 'PortfolioGain-LossReport',
                    provider: 'duckdb',
                    method: 'active',
                    isActiveConnection: true,
                    capabilities: { isStructured: true, isUnstructured: false }
                },
                {
                    id: 'research-note',
                    title: 'InvestmentStrategyNotes',
                    provider: 'notes',
                    method: 'explicit',
                    isActiveConnection: false,
                    capabilities: { isStructured: false, isUnstructured: true }
                }
            ]
        });

        expect(selection.primarySource?.id).toBe('portfolio-conn');
        expect(selection.secondarySource?.id).toBe('research-note');
    });
});

describe('portfolio planning heuristics', () => {
    test('builds a grouped market value plan for portfolio allocation questions', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'How is my portfolio allocated by fund sub category?',
            catalog: {
                tables: [{
                    name: 'portfolio_holdings',
                    columns: [
                        { name: 'fund_name' },
                        { name: 'fund_sub_category' },
                        { name: 'market_value' },
                        { name: 'net_gain_loss' }
                    ],
                    numericColumns: ['market_value', 'net_gain_loss']
                }]
            },
            tableHint: 'portfolio_holdings'
        });

        expect(plan.table).toBe('portfolio_holdings');
        expect(plan.dimensions).toEqual(['fund_sub_category']);
        expect(plan.metrics[0]).toEqual({
            column: 'market_value',
            aggregation: 'sum',
            alias: 'sum_market_value'
        });
        expect(plan.orderBy[0]).toEqual({ column: 'sum_market_value', direction: 'desc' });
    });

    test('filters negative positions for loss-focused portfolio prompts', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'Which holdings are currently at a loss?',
            catalog: {
                tables: [{
                    name: 'portfolio_holdings',
                    columns: [
                        { name: 'fund_name' },
                        { name: 'net_gain_loss' },
                        { name: 'market_value' }
                    ],
                    numericColumns: ['net_gain_loss', 'market_value']
                }]
            },
            tableHint: 'portfolio_holdings'
        });

        expect(plan.filters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    column: 'net_gain_loss',
                    operator: '<',
                    value: 0
                })
            ])
        );
        expect(plan.metrics[0].column).toBe('net_gain_loss');
    });

    test('adds a recent time filter for sales-history questions in the regional sales space', () => {
        const service = new SummaryPlanningService();
        const plan = service.createHeuristicPlan({
            prompt: 'Compare sales by region over the last 30 days',
            catalog: {
                tables: [{
                    name: 'combined_sales',
                    columns: [
                        { name: 'date' },
                        { name: 'region' },
                        { name: 'amount' },
                        { name: 'units' }
                    ],
                    numericColumns: ['amount', 'units']
                }]
            },
            tableHint: 'combined_sales'
        });

        expect(plan.filters.some((filter) => filter.column === 'date' && filter.operator === '>=')).toBe(true);
        expect(plan.dimensions).toEqual(['region']);
    });
});

describe('space-aware execution', () => {
    test('returns a direct text answer for note-only research spaces', async () => {
        const noteCandidate = {
            id: 'note-1',
            title: 'QuarterlyReview_Q4_2024',
            provider: 'notes',
            type: 'note',
            confidence: 0.93,
            capabilities: { isStructured: false, isUnstructured: true }
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
                    return [noteCandidate];
                },
                selectSources() {
                    return {
                        candidates: [noteCandidate],
                        primarySource: noteCandidate,
                        secondarySource: null,
                        confidence: 0.93,
                        requiresClarification: false
                    };
                }
            },
            intentRouter: {
                async route() {
                    return {
                        type: 'chat',
                        wantsVisualization: false,
                        needsStructured: false,
                        needsText: true,
                        requestSummary: 'Explain the main points from the quarterly review note'
                    };
                }
            },
            structuredContextBuilder: {
                async build() {
                    return null;
                }
            },
            textContextBuilder: {
                async build() {
                    return {
                        excerpts: [{
                            sourceId: 'note-1',
                            title: 'QuarterlyReview_Q4_2024',
                            provider: 'notes',
                            confidence: 0.93,
                            excerpt: 'Q4 review: energy costs were stable, but international growth slowed after November.'
                        }]
                    };
                }
            },
            executionPlanner: {
                async createPlan() {
                    return {
                        goal: 'Explain the main points from the quarterly review note',
                        sourceBindings: [{ sourceId: 'note-1', role: 'primary' }],
                        steps: [{ type: 'summarize_unstructured', sourceId: 'note-1' }],
                        requiresClarification: false,
                        expectedOutput: 'text_answer'
                    };
                }
            },
            toolExecutor: {
                async execute() {
                    return {
                        queryResults: [],
                        excerpts: [{
                            sourceId: 'note-1',
                            title: 'QuarterlyReview_Q4_2024',
                            provider: 'notes',
                            excerpt: 'Q4 review: energy costs were stable, but international growth slowed after November.'
                        }],
                        mergedResults: null,
                        finalQuery: null,
                        schemaSummary: [],
                        metrics: { toolCalls: [] }
                    };
                }
            },
            synthesizer: {
                async synthesize() {
                    return {
                        answer: 'The quarterly review says growth slowed late in the quarter while energy costs stayed stable.',
                        confidence: 0.91,
                        assumptions: [],
                        sources: [{ id: 'note-1', title: 'QuarterlyReview_Q4_2024', provider: 'notes', type: 'note' }]
                    };
                }
            }
        });

        const result = await pipeline.run({
            userId: 'user-1',
            prompt: 'Summarize the quarterly review note',
            modelId: 'mock'
        });

        expect(result.type).toBe('text_answer');
        expect(result.answer).toContain('growth slowed');
        expect(result.sources[0].provider).toBe('notes');
    });

    test('creates a best-effort portfolio query instead of clarifying when one structured source exists', async () => {
        const planner = new ExecutionPlanner();
        const plan = await planner.createPlan({
            prompt: 'What are my top 5 holdings by market value?',
            intent: {
                type: 'analysis',
                wantsVisualization: false,
                needsStructured: true,
                needsText: false
            },
            selectedSources: {
                primarySource: {
                    id: 'portfolio-conn',
                    title: 'PortfolioGain-LossReport',
                    method: 'explicit',
                    promptMatched: true,
                    capabilities: { isStructured: true }
                },
                secondarySource: null,
                candidates: [{
                    id: 'portfolio-conn',
                    title: 'PortfolioGain-LossReport',
                    capabilities: { isStructured: true }
                }],
                selectionMode: 'single_candidate',
                confidence: 0.95,
                requiresClarification: false
            },
            structuredContext: {
                summary: {
                    defaultTable: 'portfolio_holdings',
                    tables: [{
                        name: 'portfolio_holdings',
                        columns: [
                            { name: 'fund_name', type: 'text' },
                            { name: 'market_value', type: 'number' },
                            { name: 'net_gain_loss', type: 'number' }
                        ],
                        numericColumns: ['market_value', 'net_gain_loss'],
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
        const queryStep = plan.steps.find((step) => step.type === 'query_data');
        expect(queryStep?.intent.resource).toBe('portfolio_holdings');
        expect(queryStep?.intent.groupBy).toEqual(['fund_name']);
        expect(queryStep?.intent.aggregations[0].field).toBe('market_value');
    });
});
