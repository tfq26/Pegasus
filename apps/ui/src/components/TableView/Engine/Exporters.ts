import { utils, writeFile } from 'xlsx';
import { Engine } from './Engine';

/**
 * Handles data export to CSV format
 */
export class CSVExporter {
    static export(engine: Engine, filename: string = 'export.csv') {
        const data = this.getData(engine);

        const csvContent = data.map(row =>
            row.map(cell => {
                const val = String(cell ?? '');
                // Escape quotes and wrap in quotes if contains comma, quote or newline
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    private static getData(engine: Engine): any[][] {
        // Get headers excluding internal ones
        const headers = engine.columnNames.filter(h => h !== '_rowid_');
        // Map display headers to their original indices
        const headerIndices = headers.map(h => engine.columnNames.indexOf(h));

        const data: any[][] = [headers];

        // Determine range
        const cells = engine.getCells();
        let maxRow = 0;
        for (const k of cells.keys()) {
            const r = parseInt(k.split(',')[0]);
            if (!isNaN(r) && r > maxRow) maxRow = r;
        }

        // Extract data
        for (let r = 0; r <= maxRow; r++) {
            const rowData = [];
            for (const colIndex of headerIndices) {
                // Use display value for CSV (text representation)
                rowData.push(engine.getDisplayValue({ row: r, col: colIndex }));
            }
            data.push(rowData);
        }
        return data;
    }
}

/**
 * Handles data export to Excel (.xlsx) format using SheetJS
 */
export class ExcelExporter {
    static export(engine: Engine, filename: string = 'export.xlsx') {
        // Get headers excluding internal ones
        const headers = engine.columnNames.filter(h => h !== '_rowid_');
        const headerIndices = headers.map(h => engine.columnNames.indexOf(h));

        // Create worksheet data array
        const wsData: any[][] = [headers];

        let maxRow = 0;
        const cells = engine.getCells();
        for (const k of cells.keys()) {
            const r = parseInt(k.split(',')[0]);
            if (!isNaN(r) && r > maxRow) maxRow = r;
        }

        for (let r = 0; r <= maxRow; r++) {
            const rowData = [];
            for (const colIndex of headerIndices) {
                const cell = engine.getCell({ row: r, col: colIndex });
                // Use typed value for Excel (numbers as numbers, dates as dates)
                rowData.push(cell?.value ?? '');
            }
            wsData.push(rowData);
        }

        const wb = utils.book_new();
        const ws = utils.aoa_to_sheet(wsData);
        utils.book_append_sheet(wb, ws, "Sheet1");
        writeFile(wb, filename);
    }
}
