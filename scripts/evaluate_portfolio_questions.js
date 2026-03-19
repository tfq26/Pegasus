#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { interpretExcelFromXML } from '../apps/backend/ai/xmlExcelInterpreter.js';
import { DuckDBAdapter } from '../apps/backend/adapters/duckdbAdapter.js';
import { StructuredDuckDBImportService } from '../apps/backend/src/services/import/StructuredDuckDBImportService.js';
import { GroundedSummaryService } from '../apps/backend/src/v2/services/GroundedSummaryService.js';
import { SummaryPlanningService } from '../apps/backend/src/v2/services/SummaryPlanningService.js';

const workbookPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), 'e2e/fixtures/demo-data/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx');

const tableName = 'portfolio_gain_loss_report';
const tempDbPath = path.join(os.tmpdir(), `portfolio-eval-${Date.now()}.duckdb`);

const questions = [
    'How many funds are in this portfolio report?',
    'What is the total invested amount across all funds?',
    'What is the total market value across all funds?',
    'What is the total net gain or loss across all funds?',
    'Which fund has the highest market value?',
    'Which fund has the highest XIRR?',
    'Which fund has the worst net gain or loss?',
    'Show market value by member.',
    'Show net gain or loss by fund sub category.',
    'Which funds currently have a negative net gain or loss?'
];

function stringifyRows(rows) {
    return JSON.stringify(rows, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
}

async function main() {
    const parsed = await interpretExcelFromXML(workbookPath);
    if (!parsed?.data?.length) {
        throw new Error('Failed to parse workbook');
    }

    const adapter = new DuckDBAdapter({ path: tempDbPath });
    await adapter.connect();
    await StructuredDuckDBImportService.importTable(adapter, tableName, parsed.data);

    const service = new GroundedSummaryService({
        aiClient: null,
        planningService: new SummaryPlanningService(),
        connectionService: {
            async openConnection() {
                return {
                    adapter,
                    disconnect: async () => { }
                };
            }
        }
    });

    for (const question of questions) {
        const result = await service.answer({
            userId: 'dev_user',
            connectionId: 'local',
            prompt: question,
            tableHint: tableName
        });

        console.log('\n' + '='.repeat(100));
        console.log(`QUESTION: ${question}`);
        console.log(`QUERY:\n${result.query}`);
        console.log(`ANSWER: ${result.text}`);
        console.log(`ROWS: ${stringifyRows(result.rows.slice(0, 5))}`);
    }

    await adapter.disconnect().catch(() => { });
    await fs.unlink(tempDbPath).catch(() => { });
}

main().catch(async (error) => {
    console.error(error);
    await fs.unlink(tempDbPath).catch(() => { });
    process.exit(1);
});
