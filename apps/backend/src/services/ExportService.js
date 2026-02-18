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
        // Limitation: If the adapter doesn't support streams, we fall back to fetching all rows.
        // This still helps client performance but not server memory.
        // TODO: Implement getStream() in adapters for true streaming.

        // For now, we fetch all rows (same as table/load) but stream the output to the client
        // to prevent the client from crashing on large JSON payloads.
        const rows = await adapter.query(query);

        if (!Array.isArray(rows)) {
            resWritable.write('Error: Query returned no rows\n');
            resWritable.end();
            return;
        }

        // Write Header
        if (rows.length > 0) {
            const headers = Object.keys(rows[0]).map(ExportService.escapeCsv).join(',');
            resWritable.write(headers + '\n');
        }

        // Write Rows
        for (const row of rows) {
            const line = Object.values(row).map(ExportService.escapeCsv).join(',');
            resWritable.write(line + '\n');
        }

        resWritable.end();
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
