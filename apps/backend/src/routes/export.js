
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { getAuthToken } from "../../lib/auth.js";
import { verify } from "hono/jwt";
import { ConfigService } from "../services/ConfigService.js";
import { createAdapter } from "../../adapters/index.js";
import { ExportService } from "../services/ExportService.js";

const exportRoute = new Hono();
const jwtSecret = ConfigService.getJwtSecret();

// Configurable limit
const MAX_EXPORT_ROWS = parseInt(process.env.MAX_EXPORT_ROWS || '100000', 10);

exportRoute.get('/:tableName/csv', async (c) => {
    try {
        const tableName = c.req.param("tableName");
        const token = getAuthToken(c);
        if (!token) return c.json({ error: "Unauthorized" }, 401);

        let userId;
        try {
            const payload = await verify(token, jwtSecret);
            userId = payload.sub;
        } catch (e) {
            return c.json({ error: "Unauthorized" }, 401);
        }

        // Parse query params for connection info (similar to table/load)
        // Since this is a GET request, connection info must be passed as query params or inferred
        // Ideally, the frontend should POST the connection details to get a download token, 
        // but for now we'll assume the connection details are cached or provided in a way the adapter supports.
        // HOWEVER, standard pattern is to use POST for complex payloads. 
        // Let's check how the user wants to invoke this. 
        // If we use GET, we can't easily pass the full connection object.
        // Let's expect 'connectionId' or basic params.

        // REVISION: The standard strategy is to use a POST to generate a temporary "download token" 
        // which stores the query/connection, then GET /download/:token.
        // BUT for this iteration, we'll try to extract what we can from query params or body if allowed (some GETs allow body, but browser download links don't).

        // Wait, the client is downloading a file. Browser GETs don't have bodies.
        // We need to use valid query params.
        const provider = c.req.query('provider') || 'postgres';
        const connectionId = c.req.query('connectionId');

        // If we don't have a secure way to pass connection details (like password) in GET,
        // we must fetch the connection from the DB using the ID.
        let connection = {};

        if (connectionId) {
            const { db } = await import("../db/index.js");
            const { connections } = await import("../db/schema.js");
            const { eq } = await import("drizzle-orm");

            const connRow = await db.query.connections.findFirst({
                where: eq(connections.id, connectionId)
            });

            if (connRow) {
                connection = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config;
            }
        }

        const adapter = await createAdapter(provider, connection, userId);
        if (!adapter) return c.json({ error: 'Unsupported provider' }, 400);

        await adapter.connect();

        // 1. SQL Injection & Schema Validation
        // Fetch valid tables to ensure tableName exists
        const validTables = await adapter.listCollections();
        if (!validTables.includes(tableName)) {
            await adapter.disconnect();
            return c.json({ error: `Table "${tableName}" not found.` }, 404);
        }

        // 2. Row Limit Guard
        // We use LIMIT to enforce the max rows
        const query = `SELECT * FROM "${tableName}" LIMIT ${MAX_EXPORT_ROWS}`;

        // Set Headers for Download
        c.header('Content-Type', 'text/csv');
        c.header('Content-Disposition', `attachment; filename="${tableName}.csv"`);

        // Stream Response
        return stream(c, async (stream) => {
            // Write to the stream using our service
            // We need a writable wrapper because Hono's stream is async write(data)
            const writable = {
                write: async (chunk) => {
                    await stream.write(chunk);
                },
                end: async () => {
                    await stream.close();
                }
            };

            try {
                // Determine query based on provider (SQL vs NoSQL)
                let actualQuery = query;
                if (provider === 'mongodb') {
                    actualQuery = { collection: tableName, limit: MAX_EXPORT_ROWS };
                }

                await ExportService.streamCsv(adapter, actualQuery, writable);
            } catch (err) {
                console.error('Export Stream Error:', err);
                await stream.write(`\nError: ${err.message}\n`);
            } finally {
                await adapter.disconnect();
            }
        });

    } catch (e) {
        console.error('Export Error:', e);
        return c.json({ error: e.message }, 500);
    }
});

export { exportRoute };
