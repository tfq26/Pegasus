import { parseExcel } from './lib/excelParser.js';

const { sheets, metadata } = await parseExcel('/Users/taufeeqali/Projects/Pegasus/PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx');

console.log('\n=== PARSE RESULTS ===\n');

Object.entries(metadata).forEach(([sheetName, meta]) => {
    console.log(`Sheet: "${sheetName}"`);
    console.log(`  Confidence: ${(meta.confidence * 100).toFixed(0)}% (${meta.method})`);
    console.log(`  Headers detected at row: ${meta.headerRow}`);
    console.log(`  Total rows: ${meta.totalRows}`);
    console.log(`  Total columns: ${meta.totalColumns}`);
    if (meta.warnings) {
        console.log(`  ⚠️  Warnings:`, meta.warnings);
    }
    console.log(`  Headers:`, meta.headers.slice(0, 5).join(', '), '...');
    console.log();
});

const firstSheet = sheets[Object.keys(sheets)[0]];
console.log('First 2 data rows:');
firstSheet.slice(0, 2).forEach((row, i) => {
    console.log(`\nRow ${i + 1}:`);
    Object.entries(row).slice(0, 5).forEach(([key, val]) => {
        console.log(`  ${key}: ${val}`);
    });
});
