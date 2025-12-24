#!/usr/bin/env node
/**
 * Test script for the XML Excel interpreter
 */
import { interpretExcelFromXML } from '../apps/backend/ai/xmlExcelInterpreter.js';

async function testParser(filePath) {
    console.log('Testing Excel Parser on:', filePath);
    console.log('='.repeat(60));

    const result = await interpretExcelFromXML(filePath);

    if (!result) {
        console.log('Parser returned null - check logs above');
        return;
    }

    console.log('\n--- RESULTS ---');
    console.log('Columns:', result.mapping.columns.map(c => c.semanticName));
    console.log('Header Row:', result.mapping.headerRow);
    console.log('Data Rows:', result.data.length);

    console.log('\nFirst 5 data rows:');
    result.data.slice(0, 5).forEach((row, i) => {
        console.log(`\nRow ${i + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
            if (value) {
                console.log(`  ${key}: ${String(value).substring(0, 40)}`);
            }
        });
    });
}

const filePath = process.argv[2] || './PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx';
testParser(filePath);
