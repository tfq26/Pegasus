import { FlatTableStrategy } from './cleaners/FlatTableStrategy.js';
import { StructuredReportStrategy } from './cleaners/StructuredReportStrategy.js';
import { normalizeRows } from './cleaners/utils.js';

export class TableCleanerService {
    constructor(strategies = null) {
        this.strategies = strategies || [
            new StructuredReportStrategy(),
            new FlatTableStrategy(),
        ];
    }

    cleanDataset({ tableName, rows, sourceType = 'unknown', parsingHints = {} }) {
        const normalizedRows = normalizeRows(rows);
        if (!normalizedRows.length) {
            return {
                tables: [],
                metadata: {
                    sourceType,
                    strategy: 'none',
                    warnings: ['No rows to clean'],
                    candidateScores: []
                }
            };
        }

        const candidateScores = this.strategies.map((strategy) => ({
            strategy: strategy.name,
            score: strategy.score({ tableName, rows: normalizedRows, sourceType, parsingHints })
        })).sort((a, b) => b.score - a.score);

        const best = this.strategies.find((strategy) => strategy.name === candidateScores[0]?.strategy) || this.strategies[0];
        const result = best.clean({ tableName, rows: normalizedRows, sourceType, parsingHints });

        return {
            ...result,
            metadata: {
                sourceType,
                strategy: best.name,
                candidateScores,
                parsingHints
            }
        };
    }
}
