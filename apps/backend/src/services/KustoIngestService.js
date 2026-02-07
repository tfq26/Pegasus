import { IngestClient, IngestionProperties, DataFormat, IngestionMappingKind } from 'azure-kusto-ingest';
import { KustoConnectionStringBuilder } from 'azure-kusto-data';
import stream from 'stream';
import ExcelJS from 'exceljs';

export class KustoIngestService {
    /**
     * @param {string} clusterUrl https://cluster.region.kusto.windows.net
     * @param {string} accessToken OAuth token from Azure
     * @param {string} database Target database name
     */
    constructor(clusterUrl, accessToken, database) {
        // Map data URL to ingest URL: https://ingest-cluster.region.kusto.windows.net
        const ingestUrl = clusterUrl.startsWith('https://ingest-') ? clusterUrl : clusterUrl.replace('https://', 'https://ingest-');
        const kcsb = KustoConnectionStringBuilder.withTokenProvider(ingestUrl, () => accessToken);
        this.client = new IngestClient(kcsb);
        this.database = database;
    }

    /**
     * Ingest a CSV file
     */
    async ingestCsv(tableName, buffer) {
        const props = new IngestionProperties({
            database: this.database,
            table: tableName,
            format: DataFormat.CSV,
            ingestionMappingKind: IngestionMappingKind.Csv
        });

        const readableStream = new stream.PassThrough();
        readableStream.end(buffer);

        console.log(`[KustoIngest] Starting ingestion of CSV into ${this.database}.${tableName}`);
        return await this.client.ingestFromStream(readableStream, props);
    }

    /**
     * Ingest a JSON file
     */
    async ingestJson(tableName, buffer) {
        const props = new IngestionProperties({
            database: this.database,
            table: tableName,
            format: DataFormat.MULTIJSON, // Use MULTIJSON for line-delimited or array
            ingestionMappingKind: IngestionMappingKind.Json
        });

        const readableStream = new stream.PassThrough();
        readableStream.end(buffer);

        console.log(`[KustoIngest] Starting ingestion of JSON into ${this.database}.${tableName}`);
        return await this.client.ingestFromStream(readableStream, props);
    }

    /**
     * Ingest an XLSX file (converts to CSV first)
     */
    async ingestXlsx(tableName, buffer) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.getWorksheet(1); // Get first sheet

        // Convert worksheet to CSV string
        let csvContent = "";
        worksheet.eachRow((row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : []; // ExcelJS rows are 1-indexed
            csvContent += values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + "\n";
        });

        return await this.ingestCsv(tableName, Buffer.from(csvContent));
    }

    /**
     * Ingest XML (basic stream ingestion)
     */
    async ingestXml(tableName, buffer) {
        const props = new IngestionProperties({
            database: this.database,
            table: tableName,
            format: DataFormat.XML
        });

        const readableStream = new stream.PassThrough();
        readableStream.end(buffer);

        return await this.client.ingestFromStream(readableStream, props);
    }
}
