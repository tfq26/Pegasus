import { ConnectionService } from './ConnectionService.js';
import { SchemaCatalogService } from './SchemaCatalogService.js';
import { SummaryPlanningService } from './SummaryPlanningService.js';
import { SummaryQueryBuilder } from './SummaryQueryBuilder.js';
import { parseJsonBlock } from '../utils/json.js';

function summarizeRowsDeterministically(rows, plan) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 'I could not find any matching rows for that request.';
    }

    if ((plan.dimensions || []).length === 0) {
        const firstRow = rows[0];
        const pairs = Object.entries(firstRow).map(([key, value]) => `${key}: ${value}`);
        return `I checked ${plan.table} and found ${pairs.join(', ')}.`;
    }

    const topRows = rows.slice(0, 3).map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(', '));
    return `I grouped the results from ${plan.table}. Top matches: ${topRows.join(' | ')}.`;
}

export class GroundedSummaryService {
    constructor({
        connectionService = new ConnectionService(),
        schemaCatalogService = new SchemaCatalogService(),
        planningService = new SummaryPlanningService(),
        queryBuilder = new SummaryQueryBuilder(),
        aiClient = null
    } = {}) {
        this.connectionService = connectionService;
        this.schemaCatalogService = schemaCatalogService;
        this.planningService = planningService;
        this.queryBuilder = queryBuilder;
        this.aiClient = aiClient;
    }

    async answer({ userId, connectionId, prompt, model, tableHint }) {
        const session = await this.connectionService.openConnection(userId, connectionId);

        try {
            const catalog = await this.schemaCatalogService.describe(session.adapter, { prompt, tableHint });
            const plan = await this.planningService.createPlan({ prompt, catalog, model, userId, tableHint });
            if (plan.action === 'clarify') {
                return {
                    type: 'clarification',
                    question: plan.question
                };
            }

            const query = plan.query || this.queryBuilder.build(plan, catalog);
            const rows = await session.adapter.query(query);
            const text = await this.summarize({ prompt, rows, plan, model, userId });

            return {
                type: 'summary',
                text,
                answer: text,
                query,
                plan,
                rows
            };
        } finally {
            await session.disconnect();
        }
    }

    async summarize({ prompt, rows, plan, model, userId }) {
        if (!this.aiClient) {
            return summarizeRowsDeterministically(rows, plan);
        }

        try {
            const response = await this.aiClient.generateContent([
                {
                    role: 'system',
                    content: [
                        'Answer only from the provided query results.',
                        'If the rows are empty, say there was no matching data.',
                        'Do not invent columns, numbers, or trends.'
                    ].join(' ')
                },
                {
                    role: 'user',
                    content: JSON.stringify({ prompt, plan, rows: rows.slice(0, 20) }, null, 2)
                }
            ], { model, userId, json: true });

            const parsed = parseJsonBlock(response?.text || response);
            if (parsed?.answer) return parsed.answer;
            if (typeof response?.text === 'string' && response.text.trim()) return response.text.trim();
        } catch {
            // Fall through to deterministic summary.
        }

        return summarizeRowsDeterministically(rows, plan);
    }
}
