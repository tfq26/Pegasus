import { utils, writeFile } from 'xlsx';
import { Engine } from './Engine';
import type { CellPosition } from './types';
import { toast } from '@/composables/useNotifications';

/**
 * Handles data export to CSV format
 */
export class CSVExporter {
    static async export(engine: Engine, filename: string = 'export.csv', range?: { start: CellPosition, end: CellPosition }) {
        const csvContent = this.getContent(engine, range);

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

    static getContent(engine: Engine, range?: { start: CellPosition, end: CellPosition }): string {
        const data = this.getData(engine, range);
        return data.map(row =>
            row.map(cell => {
                const val = String(cell ?? '');
                // Escape quotes and wrap in quotes if contains comma, quote or newline
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        ).join('\n');
    }

    private static getData(engine: Engine, range?: { start: CellPosition, end: CellPosition }): any[][] {
        // Get headers excluding internal ones
        const allHeaders = engine.columnNames.filter(h => h !== '_rowid_');

        let headerIndices: number[] = [];
        let headers: string[] = [];
        let minRow = 0;
        let maxRow = 0;

        if (range) {
            const minCol = Math.min(range.start.col, range.end.col);
            const maxCol = Math.max(range.start.col, range.end.col);
            minRow = Math.min(range.start.row, range.end.row);
            maxRow = Math.max(range.start.row, range.end.row);

            // Filter headers based on range
            allHeaders.forEach((h, i) => {
                // internal index check might be needed if columns were reordered, but assuming columnNames is reliable
                const originalIndex = engine.columnNames.indexOf(h);
                if (originalIndex >= minCol && originalIndex <= maxCol) {
                    headers.push(h);
                    headerIndices.push(originalIndex);
                }
            });
        } else {
            headers = allHeaders;
            headerIndices = headers.map(h => engine.columnNames.indexOf(h));

            // Determine max row
            const cells = engine.getCells();
            for (const k of cells.keys()) {
                const r = parseInt(k.split(',')[0] || '0');
                if (!isNaN(r) && r > maxRow) maxRow = r;
            }
        }

        const data: any[][] = [headers];

        // Extract data
        for (let r = minRow; r <= maxRow; r++) {
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
    static async export(engine: Engine, filename: string = 'export.xlsx', range?: { start: CellPosition, end: CellPosition }) {
        // Get headers excluding internal ones
        const allHeaders = engine.columnNames.filter(h => h !== '_rowid_');

        let headerIndices: number[] = [];
        let headers: string[] = [];
        let minRow = 0;
        let maxRow = 0;

        if (range) {
            const minCol = Math.min(range.start.col, range.end.col);
            const maxCol = Math.max(range.start.col, range.end.col);
            minRow = Math.min(range.start.row, range.end.row);
            maxRow = Math.max(range.start.row, range.end.row);

            allHeaders.forEach((h, j) => {
                const originalIndex = engine.columnNames.indexOf(h);
                if (originalIndex >= minCol && originalIndex <= maxCol) {
                    headers.push(h);
                    headerIndices.push(originalIndex);
                }
            });
        } else {
            headers = allHeaders;
            headerIndices = headers.map(h => engine.columnNames.indexOf(h));

            // Determine max row
            const cells = engine.getCells();
            for (const k of cells.keys()) {
                const r = parseInt(k.split(',')[0] || '0');
                if (!isNaN(r) && r > maxRow) maxRow = r;
            }
        }

        // Create worksheet data array
        const wsData: any[][] = [headers];

        for (let r = minRow; r <= maxRow; r++) {
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

/**
 * Handles data export to PDF format
 */
export class PDFExporter {
    static async export(engine: Engine, filename: string = 'export.pdf') {
        toast.info("PDF Export coming soon. For now, please use CSV or Excel.");
        // In a real implementation, we'd use jspdf or a similar library here
    }
}
