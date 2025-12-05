import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { parseXML } from './xmlParser.js';

const execAsync = promisify(exec);

export async function parseExcel(filePath) {
    const tempDir = path.join(path.dirname(filePath), 'temp_' + path.basename(filePath, '.xlsx'));

    try {
        // 1. Unzip the xlsx file
        await fs.mkdir(tempDir, { recursive: true });
        await execAsync(`unzip -o "${filePath}" -d "${tempDir}"`);

        // 2. Read Shared Strings
        const sharedStringsPath = path.join(tempDir, 'xl', 'sharedStrings.xml');
        let sharedStrings = [];
        try {
            const sharedStringsXml = await fs.readFile(sharedStringsPath, 'utf-8');
            const parsedShared = parseXML(sharedStringsXml);
            // Structure usually: <sst><si><t>Value</t></si>...</sst>
            // My parser might output: { sst: { si: [ { t: { _text: "Value" } }, ... ] } }

            if (parsedShared.sst && parsedShared.sst.si) {
                const items = Array.isArray(parsedShared.sst.si) ? parsedShared.sst.si : [parsedShared.sst.si];
                sharedStrings = items.map(item => item.t?._text || item.t || '');
            }
        } catch (e) {
            console.warn('No shared strings found or failed to parse', e.message);
        }

        // 3. Read Workbook to get sheet names
        const workbookPath = path.join(tempDir, 'xl', 'workbook.xml');
        const workbookXml = await fs.readFile(workbookPath, 'utf-8');
        const parsedWorkbook = parseXML(workbookXml);

        const sheets = [];
        if (parsedWorkbook.workbook && parsedWorkbook.workbook.sheets && parsedWorkbook.workbook.sheets.sheet) {
            const sheetNodes = Array.isArray(parsedWorkbook.workbook.sheets.sheet)
                ? parsedWorkbook.workbook.sheets.sheet
                : [parsedWorkbook.workbook.sheets.sheet];

            sheetNodes.forEach(node => {
                // attributes like name="Sheet1" sheetId="1" r:id="rId1"
                // My parser puts attributes in _attributes
                if (node._attributes) {
                    sheets.push({
                        name: node._attributes.name,
                        id: node._attributes['r:id'] // e.g., rId1 maps to worksheets/sheet1.xml usually
                    });
                }
            });
        }

        // Map rId to filename using _rels/workbook.xml.rels if needed, 
        // but usually rId1 -> worksheets/sheet1.xml is standard enough for a simple parser?
        // Actually, it's safer to read the rels.
        const relsPath = path.join(tempDir, 'xl', '_rels', 'workbook.xml.rels');
        const relsXml = await fs.readFile(relsPath, 'utf-8');
        const parsedRels = parseXML(relsXml);
        const rels = {};
        if (parsedRels.Relationships && parsedRels.Relationships.Relationship) {
            const relNodes = Array.isArray(parsedRels.Relationships.Relationship)
                ? parsedRels.Relationships.Relationship
                : [parsedRels.Relationships.Relationship];
            relNodes.forEach(node => {
                if (node._attributes) {
                    rels[node._attributes.Id] = node._attributes.Target;
                }
            });
        }

        const result = {};

        // 4. Parse each sheet
        for (const sheet of sheets) {
            const target = rels[sheet.id];
            if (!target) continue;

            const sheetPath = path.join(tempDir, 'xl', target);
            const sheetXml = await fs.readFile(sheetPath, 'utf-8');
            const parsedSheet = parseXML(sheetXml);

            const rows = [];
            // Structure: <worksheet><sheetData><row><c t="s"><v>0</v></c>...</row>...</sheetData></worksheet>

            if (parsedSheet.worksheet && parsedSheet.worksheet.sheetData && parsedSheet.worksheet.sheetData.row) {
                const rowNodes = Array.isArray(parsedSheet.worksheet.sheetData.row)
                    ? parsedSheet.worksheet.sheetData.row
                    : [parsedSheet.worksheet.sheetData.row];

                // Extract headers from first row?
                // Let's just return array of objects.
                // We need to handle headers. Assuming first row is header.

                let headers = [];

                rowNodes.forEach((rowNode, rowIndex) => {
                    const cells = rowNode.c ? (Array.isArray(rowNode.c) ? rowNode.c : [rowNode.c]) : [];
                    const rowData = {};
                    const rowValues = [];

                    cells.forEach((cell, cellIndex) => {
                        // cell._attributes.r is the cell reference e.g. "A1"
                        // cell._attributes.t is type (s = shared string)
                        // cell.v._text is the value (index if shared string)

                        let value = cell.v?._text || cell.v;
                        if (cell._attributes && cell._attributes.t === 's') {
                            value = sharedStrings[parseInt(value)];
                        }

                        rowValues.push(value);
                    });

                    if (rowIndex === 0) {
                        headers = rowValues;
                    } else {
                        headers.forEach((header, i) => {
                            rowData[header] = rowValues[i];
                        });
                        rows.push(rowData);
                    }
                });
            }

            result[sheet.name] = rows;
        }

        return result;

    } finally {
        // Cleanup
        try {
            await execAsync(`rm -rf "${tempDir}"`);
        } catch (e) {
            console.error('Failed to cleanup temp dir', e);
        }
    }
}
