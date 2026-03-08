import { PassThrough } from 'stream';

export class ExportService {
    /**
     * Streams CSV data from an adapter to a writable response stream.
     * @param {object} adapter - The database adapter.
     * @param {string} query - The SQL query to execute.
     * @param {object} resWritable - The response writable stream.
     * @param {string} format - The export format (csv, json, etc.). Currently only csv is supported.
     */
    static async streamCsv(adapter, query, resWritable) {
        // Use queryStream if available for better performance
        const rowSource = typeof adapter.queryStream === 'function'
            ? adapter.queryStream(query)
            : await adapter.query(query);

        let firstRow = true;

        if (typeof rowSource[Symbol.asyncIterator] === 'function') {
            for await (const row of rowSource) {
                if (firstRow) {
                    const headers = Object.keys(row).map(ExportService.escapeCsv).join(',');
                    resWritable.write(headers + '\n');
                    firstRow = false;
                }
                const line = Object.values(row).map(ExportService.escapeCsv).join(',');
                resWritable.write(line + '\n');
            }
        } else if (Array.isArray(rowSource)) {
            if (rowSource.length > 0) {
                const headers = Object.keys(rowSource[0]).map(ExportService.escapeCsv).join(',');
                resWritable.write(headers + '\n');

                for (const row of rowSource) {
                    const line = Object.values(row).map(ExportService.escapeCsv).join(',');
                    resWritable.write(line + '\n');
                }
            }
        }

        resWritable.end();
    }

    static async streamXlsx(adapter, query, resWritable) {
        const ExcelJS = await import('exceljs');
        // ExcelJS.default handles ESM wrapper if present
        const WorkbookWriter = (ExcelJS.default || ExcelJS).stream?.xlsx?.WorkbookWriter;
        if (!WorkbookWriter) {
            // Fallback for different import versions
            const rows = Array.isArray(await adapter.query(query)) ? await adapter.query(query) : [];
            const workbook = new (ExcelJS.default || ExcelJS).Workbook();
            const worksheet = workbook.addWorksheet('Export');
            if (rows.length > 0) {
                worksheet.columns = Object.keys(rows[0]).map(k => ({ header: k, key: k }));
                worksheet.addRows(rows);
            }
            await workbook.xlsx.write(resWritable);
            return;
        }

        const workbook = new WorkbookWriter({ stream: resWritable });
        const worksheet = workbook.addWorksheet('Export');

        const rowSource = typeof adapter.queryStream === 'function'
            ? adapter.queryStream(query)
            : await adapter.query(query);

        let firstRow = true;

        if (typeof rowSource[Symbol.asyncIterator] === 'function') {
            for await (const row of rowSource) {
                if (firstRow) {
                    worksheet.columns = Object.keys(row).map(k => ({ header: k, key: k }));
                    firstRow = false;
                }
                worksheet.addRow(row).commit();
            }
        } else if (Array.isArray(rowSource)) {
            if (rowSource.length > 0) {
                worksheet.columns = Object.keys(rowSource[0]).map(k => ({ header: k, key: k }));
                for (const row of rowSource) {
                    worksheet.addRow(row).commit();
                }
            }
        }

        await workbook.commit();
    }

    static escapeCsv(val) {
        if (val === null || val === undefined) return '';

        // Handle BigInt explicitly to preserve precision
        if (typeof val === 'bigint') {
            return val.toString();
        }

        const str = String(val);
        // If the value contains comma, double quote, or newline, escape it
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }
}
