import { parseJsonBlock } from '../utils/json.js';
import { quoteIdentifier, toSqlLiteral } from '../utils/sql.js';

function tokenize(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function normalizeIdentifier(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function columnScore(columnName, promptTerms) {
    const parts = tokenize(columnName);
    return promptTerms.reduce((score, term) => score + (parts.includes(term) ? 2 : (parts.some((part) => part.includes(term) || term.includes(part)) ? 1 : 0)), 0);
}

function findColumn(table, matcher) {
    return table.columns.find((column) => matcher(String(column.name || ''))) || null;
}

function findColumnByNames(table, names = []) {
    const normalizedNames = names.map(normalizeIdentifier);
    return findColumn(table, (columnName) => normalizedNames.includes(normalizeIdentifier(columnName)));
}

function findTimeColumn(table) {
    return findColumn(table, (columnName) => /\b(timestamp|time|created|updated|recorded|date|day)\b/i.test(columnName))
        || findColumnByNames(table, ['ts', 'eventTime']);
}

function looksLikeTimeSeriesPrompt(prompt) {
    const lower = String(prompt || '').toLowerCase();
    return /\b(line\s+(graph|chart)|trend|over\s+time|timeline|time\s+series|histor(?:y|ical)|plot)\b/.test(lower);
}

function buildIsoDate(daysAgo = 0, startOfDay = false) {
    const value = new Date();
    if (startOfDay) {
        value.setHours(0, 0, 0, 0);
    }
    value.setDate(value.getDate() - daysAgo);
    return value.toISOString();
}

function inferTimeFilters(table, prompt) {
    const lower = String(prompt || '').toLowerCase();
    const timeColumn = findTimeColumn(table);
    if (!timeColumn) return [];

    if (/\btoday\b|\bright now\b|\bcurrently\b/.test(lower)) {
        return [{ column: timeColumn.name, operator: '>=', value: buildIsoDate(0, true) }];
    }

    const dayMatch = lower.match(/\blast\s+(\d+)\s+days?\b/);
    if (dayMatch) {
        return [{ column: timeColumn.name, operator: '>=', value: buildIsoDate(Number(dayMatch[1])) }];
    }

    if (/\blast\s+week\b/.test(lower)) {
        return [{ column: timeColumn.name, operator: '>=', value: buildIsoDate(7) }];
    }

    if (/\blast\s+month\b/.test(lower)) {
        return [{ column: timeColumn.name, operator: '>=', value: buildIsoDate(30) }];
    }

    return [];
}

function buildServerVariants(serverNumber) {
    if (!serverNumber) return [];
    return [...new Set([
        `app-server-${serverNumber}`,
        `app server ${serverNumber}`,
        `app_server_${serverNumber}`,
        `server-${serverNumber}`,
        `server ${serverNumber}`,
        `server_${serverNumber}`,
        `appserver${serverNumber}`
    ])];
}

function inferNamedEntityFilter(table, prompt) {
    const lower = String(prompt || '').toLowerCase();
    const serverMatch = lower.match(/\b(?:app[-\s]?server|server)\s*(\d+)\b/);
    if (!serverMatch) return null;

    const entityColumn = findColumnByNames(table, [
        'serverId',
        'serverName',
        'server_id',
        'server_name',
        'host',
        'hostname',
        'instance',
        'instanceName',
        'node'
    ]);

    if (!entityColumn) return null;

    return {
        column: entityColumn.name,
        operator: 'in',
        value: buildServerVariants(serverMatch[1])
    };
}

function inferAggregation(prompt, metricColumn, hasDimension) {
    const lower = String(prompt || '').toLowerCase();
    const additiveMetrics = new Set([
        'invested_amount',
        'cost_amount',
        'withdrawal_switch_out_amount',
        'dividend_amount',
        'market_value',
        'net_gain_loss'
    ]);
    const rateMetrics = new Set(['absolute_return_pct', 'xirr_pct', 'average_cost', 'nav']);

    if (/(how many|count|number of)/.test(lower)) return 'count';
    if (/(average|avg|mean)/.test(lower)) return 'avg';
    if (/(total|sum)/.test(lower)) return 'sum';
    if (/(minimum|min|lowest|smallest|worst|least)/.test(lower)) return 'min';
    if (/(maximum|max|highest|largest|best|most)/.test(lower)) return 'max';
    if (metricColumn && additiveMetrics.has(metricColumn)) return 'sum';
    if (metricColumn && rateMetrics.has(metricColumn) && hasDimension) return 'avg';
    return 'count';
}

function chooseTable(catalog, prompt, tableHint) {
    if (tableHint) {
        const hinted = catalog.tables.find((table) => table.name === tableHint);
        if (hinted) return hinted;
    }

    const promptTerms = tokenize(prompt);
    const promptSlug = normalizeIdentifier(prompt);
    const scored = catalog.tables.map((table) => {
        const words = tokenize(`${table.name} ${table.columns.map((column) => column.name).join(' ')}`);
        const tableSlug = normalizeIdentifier(table.name);
        let score = promptTerms.reduce((sum, term) => sum + (words.includes(term) ? 1 : 0), 0);
        if (tableSlug && promptSlug.includes(tableSlug)) score += 10;
        return { table, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.table || catalog.tables[0];
}

function chooseMetricColumn(table, prompt, aggregation) {
    const lower = String(prompt || '').toLowerCase();
    const promptTerms = tokenize(prompt);
    const scored = table.numericColumns
        .map((column) => ({ column, score: columnScore(column, promptTerms) }))
        .sort((a, b) => b.score - a.score);
    const matchingColumn = scored[0]?.score > 0 ? scored[0].column : null;
    if (matchingColumn) return matchingColumn;

    const issuePriority = [
        'error_count',
        'error_rate',
        'latency_ms',
        'latencyms',
        'cpu_percent',
        'cpupercent',
        'memory_percent',
        'memorypercent',
        'disk_io_ops',
        'diskioops'
    ];
    const normalizedNumericColumns = table.numericColumns.map((column) => ({
        column,
        normalized: normalizeIdentifier(column)
    }));

    if (/\b(attention|issue|problem|health|status|right now|currently)\b/.test(lower)) {
        for (const preferred of issuePriority) {
            const match = normalizedNumericColumns.find((column) => column.normalized === normalizeIdentifier(preferred));
            if (match) return match.column;
        }
    }

    if (/\b(summary|summarize|overview|how is .* looking)\b/.test(lower)) {
        for (const preferred of ['cpuPercent', 'latencyMs', 'memoryPercent', 'diskIoOps']) {
            const match = normalizedNumericColumns.find((column) => column.normalized === normalizeIdentifier(preferred));
            if (match) return match.column;
        }
    }

    if (/\b(allocation|allocated|allocation by|exposure|concentration|share of portfolio|portfolio share)\b/.test(lower)) {
        for (const preferred of ['market_value', 'current_value', 'value', 'invested_amount']) {
            const match = normalizedNumericColumns.find((column) => column.normalized === normalizeIdentifier(preferred));
            if (match) return match.column;
        }
    }

    if (/\b(top|highest|largest|biggest)\b.*\b(holding|holdings|position|positions|fund|funds)\b/.test(lower)) {
        for (const preferred of ['market_value', 'current_value', 'value', 'net_gain_loss']) {
            const match = normalizedNumericColumns.find((column) => column.normalized === normalizeIdentifier(preferred));
            if (match) return match.column;
        }
    }

    if (aggregation === 'count') return '*';
    return table.numericColumns[0] || '*';
}

function chooseDimension(table, prompt) {
    const lower = String(prompt || '').toLowerCase();
    if (/\b(app\s+server|server|host|instance|node)\b/.test(lower)) {
        const entityColumn = findColumnByNames(table, [
            'serverName',
            'server_name',
            'host',
            'hostname',
            'instance',
            'instanceName',
            'node',
            'serverId'
        ]);
        if (entityColumn) return entityColumn.name;
    }

    const byMatch = lower.match(/\bby\s+([a-zA-Z0-9_]+)/);
    const explicitMappings = [
        { pattern: /\bby member\b/, column: 'member_id' },
        { pattern: /\bby fund sub category\b|\bby sub category\b|\bby category\b/, column: 'fund_sub_category' },
        { pattern: /\bby fund\b/, column: 'fund_name' }
    ];

    for (const mapping of explicitMappings) {
        if (mapping.pattern.test(lower) && table.columns.find((column) => column.name === mapping.column)) {
            return mapping.column;
        }
    }

    if (/\b(top|highest|largest|biggest|worst|lowest)\b.*\b(holding|holdings|position|positions)\b/.test(lower) && table.columns.find((column) => column.name === 'fund_name')) {
        return 'fund_name';
    }

    if (/(which fund|top fund|highest fund|lowest fund|best fund|worst fund)/.test(lower) && table.columns.find((column) => column.name === 'fund_name')) {
        return 'fund_name';
    }

    if (!byMatch) return null;
    const requested = byMatch[1];
    return table.columns.find((column) => column.name.toLowerCase() === requested)?.name || null;
}

function inferFilters(table, prompt) {
    const lower = String(prompt || '').toLowerCase();
    const filters = inferTimeFilters(table, prompt);
    const entityFilter = inferNamedEntityFilter(table, prompt);

    if (entityFilter) {
        filters.push(entityFilter);
    }

    if (table.columns.find((column) => column.name === 'member_id')) {
        const memberMatch = lower.match(/\bmember\s+(\d+)\b/);
        if (memberMatch) {
            filters.push({ column: 'member_id', operator: '=', value: Number(memberMatch[1]) });
        }
    }

    if (table.columns.find((column) => column.name === 'net_gain_loss')) {
        if (/\bnegative\b|\bloss-making\b|\bat a loss\b|\blosses\b/.test(lower)) {
            filters.push({ column: 'net_gain_loss', operator: '<', value: 0 });
        } else if (/\bpositive\b|\bprofit\b|\bgainers\b/.test(lower)) {
            filters.push({ column: 'net_gain_loss', operator: '>', value: 0 });
        }
    }

    return filters;
}

function buildFilterSql(table, filter) {
    if (!filter?.column) return null;
    const validColumn = table.columns.find((column) => column.name === filter.column);
    if (!validColumn) return null;

    const columnSql = quoteIdentifier(filter.column);

    if (filter.operator === 'contains') {
        return `${columnSql} LIKE ${toSqlLiteral(`%${filter.value}%`)}`;
    }

    if (filter.operator === 'in') {
        const values = Array.isArray(filter.value) ? filter.value.filter((value) => value != null) : [filter.value];
        if (values.length === 0) return null;
        return `${columnSql} IN (${values.map((value) => toSqlLiteral(value)).join(', ')})`;
    }

    return `${columnSql} ${filter.operator} ${toSqlLiteral(filter.value)}`;
}

function buildTimeSeriesQuery({ table, timeColumn, metricColumn, entityColumn, filters = [], limit = 200 }) {
    const selectColumns = [timeColumn.name];

    if (entityColumn?.name && !selectColumns.includes(entityColumn.name)) {
        selectColumns.push(entityColumn.name);
    }

    if (metricColumn && metricColumn !== '*' && !selectColumns.includes(metricColumn)) {
        selectColumns.push(metricColumn);
    }

    const whereParts = filters
        .map((filter) => buildFilterSql(table, filter))
        .filter(Boolean);

    return [
        `SELECT ${selectColumns.map((column) => quoteIdentifier(column)).join(', ')}`,
        `FROM ${quoteIdentifier(table.name)}`,
        whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '',
        `ORDER BY ${quoteIdentifier(timeColumn.name)} ASC`,
        `LIMIT ${Math.min(Math.max(limit, 1), 500)}`
    ].filter(Boolean).join(' ');
}

function inferOrdering(prompt, metricAlias, dimension) {
    const lower = String(prompt || '').toLowerCase();
    if (!metricAlias) return [];
    if (/\bhighest\b|\btop\b|\bbest\b|\blargest\b|\bmost\b/.test(lower)) {
        return [{ column: metricAlias, direction: 'desc' }];
    }
    if (/\blowest\b|\bworst\b|\bsmallest\b|\bleast\b|\bnegative\b/.test(lower)) {
        return [{ column: metricAlias, direction: 'asc' }];
    }
    if (dimension) {
        return [{ column: metricAlias, direction: 'desc' }];
    }
    return [];
}

function buildSummaryMetrics(table, prompt, dimension) {
    const lower = String(prompt || '').toLowerCase();
    const numericColumns = table.numericColumns || [];

    if (!/\b(summary|summarize|overview|how is .* looking)\b/.test(lower) || numericColumns.length === 0) {
        return null;
    }

    const preferred = ['cpuPercent', 'memoryPercent', 'latencyMs', 'diskIoOps']
        .map((name) => numericColumns.find((column) => normalizeIdentifier(column) === normalizeIdentifier(name)))
        .filter(Boolean);

    const selected = [...new Set(preferred.length > 0 ? preferred : numericColumns.slice(0, 3))];
    const metrics = selected.map((column) => ({
        column,
        aggregation: dimension ? 'avg' : 'avg',
        alias: `avg_${column.replace('*', 'rows')}`
    }));

    if (!metrics.find((metric) => metric.column === '*')) {
        metrics.push({
            column: '*',
            aggregation: 'count',
            alias: 'row_count'
        });
    }

    return metrics;
}

export class SummaryPlanningService {
    constructor({ aiClient } = {}) {
        this.aiClient = aiClient;
    }

    async createPlan({ prompt, catalog, model, userId, tableHint }) {
        const heuristicPlan = this.createHeuristicPlan({ prompt, catalog, tableHint });
        if (!this.aiClient) return heuristicPlan;

        try {
            const system = [
                'You are building a grounded database summary plan.',
                'Return JSON only.',
                'Use only the tables and columns provided.',
                'If the request is ambiguous, return {"action":"clarify","question":"..."}',
                'Otherwise return {"action":"summarize","table":"...","dimensions":[],"metrics":[{"column":"...","aggregation":"count|sum|avg|min|max","alias":"..."}],"filters":[],"orderBy":[],"limit":25,"reason":"..."}'
            ].join(' ');
            const user = JSON.stringify({ prompt, tableHint, catalog }, null, 2);
            const response = await this.aiClient.generateContent([
                { role: 'system', content: system },
                { role: 'user', content: user }
            ], { model, userId, json: true });
            const parsed = parseJsonBlock(response?.text || response);
            if (!parsed || parsed.action === 'clarify') {
                return heuristicPlan;
            }
            return this.validatePlan(parsed, catalog, heuristicPlan);
        } catch {
            return heuristicPlan;
        }
    }

    createHeuristicPlan({ prompt, catalog, tableHint }) {
        const table = chooseTable(catalog, prompt, tableHint);
        const lower = String(prompt || '').toLowerCase();
        const timeColumn = findTimeColumn(table);
        const filters = inferFilters(table, prompt);
        const hasExplicitTimeFilter = filters.some((filter) => filter.column === timeColumn?.name);
        const namedEntityFilter = inferNamedEntityFilter(table, prompt);
        const entityColumn = namedEntityFilter
            ? findColumn(table, (columnName) => normalizeIdentifier(columnName) === normalizeIdentifier(namedEntityFilter.column))
            : null;
        const timeSeriesMetric = chooseMetricColumn(table, prompt, 'avg');

        if (timeColumn && looksLikeTimeSeriesPrompt(prompt) && timeSeriesMetric && timeSeriesMetric !== '*') {
            const timeSeriesFilters = [...filters];
            if (!hasExplicitTimeFilter) {
                timeSeriesFilters.push({ column: timeColumn.name, operator: '>=', value: buildIsoDate(7) });
            }

            return {
                action: 'summarize',
                table: table.name,
                dimensions: [],
                metrics: [],
                filters: timeSeriesFilters,
                orderBy: [{ column: timeColumn.name, direction: 'asc' }],
                limit: 200,
                query: buildTimeSeriesQuery({
                    table,
                    timeColumn,
                    metricColumn: timeSeriesMetric,
                    entityColumn,
                    filters: timeSeriesFilters,
                    limit: 200
                }),
                reason: 'Heuristic v2 time-series plan'
            };
        }

        const dimension = chooseDimension(table, prompt);
        const summaryMetrics = buildSummaryMetrics(table, prompt, dimension);
        const metricColumn = chooseMetricColumn(table, prompt, 'count');
        const aggregation = inferAggregation(prompt, metricColumn, Boolean(dimension));
        const primaryMetric = summaryMetrics?.[0] || null;
        const metricAlias = primaryMetric
            ? primaryMetric.alias
            : (aggregation === 'count' && metricColumn === '*' ? 'row_count' : `${aggregation}_${metricColumn.replace('*', 'rows')}`);
        const asksForList = /\bwhich\b|\blist\b|\bshow\b/.test(lower);
        const rankingPrompt = /\bhighest\b|\btop\b|\bbest\b|\blargest\b|\blowest\b|\bworst\b|\bsmallest\b|\bleast\b/.test(lower);
        const needsSingleEntity = /\bwhich\b.*\b(server|host|instance|node)\b|\bneeds the most attention\b/.test(lower);

        return {
            action: 'summarize',
            table: table.name,
            dimensions: dimension ? [dimension] : [],
            metrics: summaryMetrics || [{
                column: metricColumn,
                aggregation,
                alias: metricAlias
            }],
            filters,
            orderBy: inferOrdering(prompt, metricAlias, dimension),
            limit: needsSingleEntity || rankingPrompt ? 1 : (asksForList || dimension ? 10 : 1),
            reason: 'Heuristic v2 summary plan'
        };
    }

    validatePlan(candidate, catalog, fallback) {
        const table = catalog.tables.find((entry) => entry.name === candidate.table);
        if (!table) return fallback;

        const validColumns = new Set(table.columns.map((column) => column.name));
        const validMetric = (candidate.metrics || []).every((metric) => metric.column === '*' || validColumns.has(metric.column));
        const validDimensions = (candidate.dimensions || []).every((column) => validColumns.has(column));
        const validFilters = (candidate.filters || []).every((filter) => validColumns.has(filter.column));

        if (!validMetric || !validDimensions || !validFilters) {
            return fallback;
        }

        return {
            action: 'summarize',
            table: candidate.table,
            dimensions: candidate.dimensions || [],
            metrics: candidate.metrics?.length ? candidate.metrics : fallback.metrics,
            filters: candidate.filters || [],
            orderBy: candidate.orderBy || fallback.orderBy,
            limit: candidate.limit || fallback.limit,
            reason: candidate.reason || fallback.reason
        };
    }
}
