import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpretExcelFromXML } from '../ai/xmlExcelInterpreter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workbookPath = path.resolve(__dirname, '../../../e2e/fixtures/demo-data/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx');

describe('interpretExcelFromXML portfolio report', () => {
    test('extracts normalized portfolio holdings with hierarchy preserved', async () => {
        const result = await interpretExcelFromXML(workbookPath);
        expect(result).toBeTruthy();
        expect(result.data.length).toBe(24);

        const firstRow = result.data[0];
        expect(firstRow.member_id).toBe(1);
        expect(firstRow.fund_sub_category).toBe('Equity - Large & MidCap');
        expect(firstRow.fund_name).toBe('Kotak Large & Midcap Reg-G');
        expect(firstRow.invested_amount).toBe('1200000');
        expect(firstRow.balance_units).toBe('4734.7079999999996');
        expect(firstRow.market_value).toBe('1656949');
        expect(firstRow.xirr_pct).toBe('16.829999999999998');
    });
});
