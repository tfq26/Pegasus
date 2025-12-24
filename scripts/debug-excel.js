#!/usr/bin/env node
/**
 * Debug script to analyze Excel file structure
 * Run: node scripts/debug-excel.js <path-to-excel-file>
 */

import AdmZip from 'adm-zip';
import { parseXML } from '../apps/backend/lib/xmlParser.js';
import ExcelJS from 'exceljs';

async function debugExcel(filePath) {
    console.log('='.repeat(80));
    console.log('EXCEL DEBUG ANALYSIS');
    console.log('File:', filePath);
    console.log('='.repeat(80));

    // Method 1: ExcelJS parsing
    console.log('\n--- ExcelJS ANALYSIS ---');
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);

        workbook.eachSheet((worksheet, sheetId) => {
            console.log(`\nSheet ${sheetId}: "${worksheet.name}"`);
            console.log(`  Rows: ${worksheet.rowCount}, Columns: ${worksheet.columnCount}`);

            // Show first 15 rows
            console.log('\n  First 15 rows:');
            for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
                const row = worksheet.getRow(r);
                const values = [];

                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    while (values.length < colNumber - 1) values.push('');

                    let value = '';
                    if (cell.value === null || cell.value === undefined) {
                        value = '';
                    } else if (typeof cell.value === 'object') {
                        if (cell.value.result !== undefined) {
                            value = cell.value.result;
                        } else if (cell.value.richText) {
                            value = cell.value.richText.map(rt => rt.text || '').join('');
                        } else if (cell.value.text !== undefined) {
                            value = cell.value.text;
                        } else if (cell.value instanceof Date) {
                            value = cell.value.toISOString().split('T')[0];
                        } else {
                            value = JSON.stringify(cell.value);
                        }
                    } else {
                        value = cell.value;
                    }

                    values.push(value);
                });

                const displayValues = values.map(v => {
                    const s = String(v).substring(0, 20);
                    return s.padEnd(22);
                });

                console.log(`  Row ${String(r).padStart(2)}: ${displayValues.join(' | ')}`);
            }

            // Check for merged cells
            const merges = worksheet.model.merges || [];
            if (merges.length > 0) {
                console.log(`\n  Merged Cells (${merges.length}):`, merges.slice(0, 10).join(', '));
            }
        });
    } catch (e) {
        console.error('ExcelJS Error:', e.message);
    }

    // Method 2: Raw XML parsing
    console.log('\n\n--- RAW XML ANALYSIS ---');
    try {
        const zip = new AdmZip(filePath);

        // Get shared strings
        const sharedStringsXML = zip.readAsText('xl/sharedStrings.xml');
        const parsedShared = parseXML(sharedStringsXML);
        const sharedStrings = [];

        if (parsedShared.sst && parsedShared.sst.si) {
            const items = Array.isArray(parsedShared.sst.si) ? parsedShared.sst.si : [parsedShared.sst.si];
            items.forEach(item => {
                if (item.t) {
                    sharedStrings.push(typeof item.t === 'string' ? item.t : (item.t._text || ''));
                } else if (item.r) {
                    const rNodes = Array.isArray(item.r) ? item.r : [item.r];
                    sharedStrings.push(rNodes.map(r => r.t?._text || r.t || '').join(''));
                }
            });
        }

        console.log(`Found ${sharedStrings.length} shared strings`);
        console.log('First 20 shared strings:', sharedStrings.slice(0, 20));

        // Get sheet1 data
        const sheetXML = zip.readAsText('xl/worksheets/sheet1.xml');
        const parsedSheet = parseXML(sheetXML);

        if (parsedSheet.worksheet?.sheetData?.row) {
            const rowNodes = Array.isArray(parsedSheet.worksheet.sheetData.row)
                ? parsedSheet.worksheet.sheetData.row
                : [parsedSheet.worksheet.sheetData.row];

            console.log(`\nTotal rows in XML: ${rowNodes.length}`);

            // Show first 10 rows
            console.log('\nFirst 10 rows (raw cells):');
            for (let i = 0; i < Math.min(10, rowNodes.length); i++) {
                const rowNode = rowNodes[i];
                const rowNum = rowNode._attributes?.r || i + 1;
                const cells = rowNode.c ? (Array.isArray(rowNode.c) ? rowNode.c : [rowNode.c]) : [];

                const cellData = cells.map(cell => {
                    let value = cell.v?._text || cell.v || '';
                    if (cell._attributes?.t === 's') {
                        const idx = parseInt(value);
                        value = sharedStrings[idx] || '';
                    }
                    const ref = cell._attributes?.r || '';
                    return `${ref}:"${String(value).substring(0, 15)}"`;
                });

                console.log(`  Row ${rowNum}: ${cellData.join(', ')}`);
            }
        }

        // Check for merged cells in XML
        if (parsedSheet.worksheet?.mergeCells?.mergeCell) {
            const mergeCells = Array.isArray(parsedSheet.worksheet.mergeCells.mergeCell)
                ? parsedSheet.worksheet.mergeCells.mergeCell
                : [parsedSheet.worksheet.mergeCells.mergeCell];

            console.log(`\nMerged cells in XML (${mergeCells.length}):`);
            mergeCells.slice(0, 15).forEach(mc => {
                console.log(`  ${mc._attributes?.ref}`);
            });
        }

    } catch (e) {
        console.error('XML Parsing Error:', e.message);
    }

    console.log('\n' + '='.repeat(80));
}

// Run with the provided file
const filePath = process.argv[2] || './PortfolioGain-LossReport45ce8911-3904-4af4-b073-d6d594d76aef.xlsx';
debugExcel(filePath);
