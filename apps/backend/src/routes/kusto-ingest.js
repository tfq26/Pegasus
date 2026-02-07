import { Hono } from 'hono';
import { secretService } from '../services/SecretService.js';
import { KustoIngestService } from '../services/KustoIngestService.js';
import { getAuthToken } from '../../lib/auth.js';
import { verify } from 'hono/jwt';
import { ConfigService } from '../services/ConfigService.js';
import { AzureAuthService } from '../services/AzureAuthService.js';

const kustoIngest = new Hono();
const jwtSecret = ConfigService.getJwtSecret();

kustoIngest.post('/upload', async (c) => {
    try {
        const token = getAuthToken(c);
        if (!token) return c.json({ error: 'Unauthorized' }, 401);
        const payload = await verify(token, jwtSecret);
        const userId = payload.sub;

        const body = await c.req.parseBody();
        const file = body.file; // The uploaded file
        const { cluster_url, database, table, format } = body;

        if (!file || !cluster_url || !database || !table) {
            return c.json({ error: 'Missing parameters' }, 400);
        }

        // Get scoped Azure token for Kusto
        const access_token = await AzureAuthService.getAccessTokenForScope(
            userId,
            'https://kusto.kusto.windows.net/.default'
        );

        const ingestService = new KustoIngestService(cluster_url, access_token, database);
        const buffer = Buffer.from(await file.arrayBuffer());

        const fileName = file.name.toLowerCase();
        let result;

        if (fileName.endsWith('.csv')) {
            result = await ingestService.ingestCsv(table, buffer);
        } else if (fileName.endsWith('.json')) {
            result = await ingestService.ingestJson(table, buffer);
        } else if (fileName.endsWith('.xlsx')) {
            result = await ingestService.ingestXlsx(table, buffer);
        } else if (fileName.endsWith('.xml')) {
            result = await ingestService.ingestXml(table, buffer);
        } else {
            return c.json({ error: 'Unsupported file format for Kusto ingestion' }, 400);
        }

        return c.json({ success: true, result });
    } catch (error) {
        console.error('[KustoIngest Route] Error:', error);
        return c.json({ error: error.message }, 500);
    }
});

export default kustoIngest;
