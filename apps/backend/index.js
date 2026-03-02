import 'dotenv/config';
console.log("[Checkpoint] dotenv loaded");
import { Hono } from "hono"
import { cors } from "hono/cors"
console.log("[Checkpoint] Hono primitive modules loaded");
import { adapters, createAdapter } from "./adapters/index.js"
import { serve } from '@hono/node-server'
import { handle } from '@hono/node-server/vercel'
import { compress } from 'hono/compress'
import { etag } from 'hono/etag'
console.log("[Checkpoint] Hono server modules loaded");
import { initSocketServer } from "./src/socket.js"
import { ConfigService } from "./src/services/ConfigService.js"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import aiRoutes from "./src/routes/ai.js"
import { sign, verify } from "hono/jwt"
console.log("[Checkpoint] App core services loaded");
import { db } from "./src/db/index.js"
import { users, connections, userPayments, transactionMaster, dataSources, cellBindings, queryHistory, spaceFiles, dataSpaces, files, spaceNotes } from "./src/db/schema.js"
import { eq, and, or, sql, desc, asc, like, gte, lte, isNull } from "drizzle-orm"


import { stockService } from "./src/services/StockService.js"
import { weatherService } from "./src/routes/weather.js"
import { dashboardRoutes } from "./src/routes/dashboard.js"
import { connectionRoutes } from "./src/routes/connection.js"
import { tableRoutes } from "./src/routes/table.js"
import { chatRoutes } from "./src/routes/chat.js"
import { operationRoutes } from "./src/routes/operations.js"
import { workspaceRoutes } from "./src/routes/workspace.js"
import { stockRoutes } from "./src/routes/stock.js"
import { provisionRoutes } from "./src/routes/provision.js"
import docsRoutes from "./src/routes/docs.js"
import { ragRoutes } from "./src/routes/rag.js"
import { agentRoutes } from "./src/routes/agent.js"
import { weatherRoutes } from "./src/routes/weather.js"
import cloudAuth from "./src/routes/cloud-auth.js"
import cloudProvision from "./src/routes/cloud-provision.js"
import { dataSourceRoutes } from "./src/routes/data-sources.js"
import kustoIngest from "./src/routes/kusto-ingest.js"
import { spaceRoutes } from "./src/routes/space.js"
import { startPollingService } from "./src/services/polling-service.js"
import { aiClient } from "./ai/AIClient.js"
import { parseExcel } from "./lib/excelParser.js"
import { parseXML, flattenXML } from "./lib/xmlParser.js"
import { authRoutes } from "./src/routes/auth.js"
import { getAuthToken } from "./lib/auth.js"
import { getPayments } from "./src/routes/payments.js"
import adminFixTier from "./src/routes/admin-fix-tier.js"
import { analyzeForSanitization, applySanitization } from "./ai/sanitizer.js"
import { authMiddleware, requireUser } from "./src/middleware/auth.js"
import { storageRoutes } from "./src/routes/storage.js"
import importRoutes from "./src/routes/import.js"
import supportRoutes from "./src/routes/support.js"
import piscesRoutes from "./src/routes/pisces.js"
import { queryRoutes } from "./src/routes/query.js"
import { querySessionRoutes } from "./src/routes/querySessions.js"
import sheetsRouter from "./src/routes/sheets.js"
import {
    EXPERIMENTAL_FEATURES,
    initExperimentalTables,
    getExperimentalStatus,
    getUserFeatureFlags,
    createExperimentalRequest,
    grantExperimentalAccess,
    toggleUserFeature
} from "./experimental-features.js"
import { notifyExperimentalRequest } from "./src/services/emailService.js"
import { RAGService } from "./src/services/ragService.js"
import { EntitlementService } from "./src/services/EntitlementService.js"
import { StorageManager } from "./src/services/storage/StorageManager.js"
import { getUserUsageSummary, calculateUserLimits } from "./lib/tierLimits.js"
import Stripe from "stripe"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import { logger } from "./src/services/Logger.js";
import { traceMiddleware } from "./src/middleware/trace.js";
import { errorMiddleware } from "./src/middleware/error.js";
import { cacheMiddleware } from "./src/middleware/cache.js";
import { analyzeAndPrintToTerminal } from "./src/lib/piscesTerminal.js"

console.log(`[Backend] Booting Pegasus at ${new Date().toISOString()}`);

// Initialize Jobs (moved to background)
import { startAllJobs } from "./src/jobs/index.js";

const port = process.env.PORT || 3000;
const jwtSecret = ConfigService.getJwtSecret();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

const frontendUrl = ConfigService.getFrontendUrl();
const isProd = ConfigService.isProduction();
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_URL?.includes('vercel.app');

console.log(`[Backend] Mode: ${isProd ? 'Production' : 'Development'}`);
console.log(`[Backend] Environment: ${isVercel ? 'Vercel' : 'Standard'}`);
console.log(`[Backend] Port: ${port}`);

const allowedOrigins = [

    "https://pegasus-ui-chi.vercel.app",
    frontendUrl,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
].filter(Boolean);

const app = new Hono()

// --- Global Trace & Logging Middleware ---
app.use('*', traceMiddleware);

// Health Checks (Immediate)
app.get('/health', (c) => c.text('PEGASUS_OK'))
app.get('/debug/info', (c) => {
    return c.json({
        time: new Date().toISOString(),
        port: process.env.PORT,
        isVercel: isVercel,
        node_env: process.env.NODE_ENV,
        allowedOrigins: allowedOrigins,
        frontendUrl: frontendUrl
    })
})
logger.info("Diagnostic routes and logger registered");

// Refined CORS configuration
const corsConfig = {
    origin: (origin) => {
        if (!origin) return allowedOrigins[0];

        // 1. Explicit whitelist
        if (allowedOrigins.includes(origin)) return origin;

        // 2. Extra safety for exact production deployment
        if (origin === "https://pegasus-ui-chi.vercel.app") return origin;

        return null;
    },
    methods: ["GET", "POST", "OPTIONS", "DELETE", "PUT"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With", "Accept", "Origin", "x-user-id"],
    exposeHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
    maxAge: 86400
};

// --- Chat Endpoint ---
app.use("/ai/chat/*", cors(corsConfig))

// Apply CORS globally
app.use("*", cors(corsConfig))

// --- Unhandled Rejection Capture ---
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    setTimeout(() => process.exit(1), 2000);
});

// DEV_MODE Middleware: Injects mock user for all protected operations
if (process.env.PEGASUS_DEV_MODE === 'true') {
    console.log("🛠️  [DEV_MODE] Authentication bypass middleware active");
    app.use("*", async (c, next) => {
        let token = getAuthToken(c);

        // If no token or it's the placeholder string, inject a real signed one
        if (!token || token === 'dev_token') {
            const devPayload = {
                sub: 'dev_user',
                email: 'dev@pegasus.ai',
                firstName: 'Developer',
                lastName: 'User',
                exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365, // 1 year
            };
            const devToken = await sign(devPayload, jwtSecret);
            c.req.raw.headers.set('Authorization', `Bearer ${devToken}`);
            console.log("🛠️  [DEV_MODE] Injected/Fixed dev token for request:", c.req.path);
        }
        await next();
    });
}

// (Manual loggers removed in favor of traceMiddleware)

if (typeof CompressionStream !== 'undefined') {
    app.use('*', async (c, next) => {
        if (c.req.path === '/ai/generate') return next()
        return compress()(c, next)
    })
}
app.use('*', async (c, next) => {
    if (c.req.path === '/ai/generate') return next()
    return etag()(c, next)
})

// Ensure database connection on Vercel (serverless environment)
// On Vercel, startServer() is NOT called, so we need to connect on first request
// isVercel is defined at the top

// No-op for database connection check


// Global Error Handlers
app.notFound((c) => {
    const origin = c.req.header('origin')
    if (origin && (allowedOrigins.includes(origin) || (origin.endsWith('.vercel.app') && origin.includes('pegasus')))) {
        c.header('Access-Control-Allow-Origin', origin)
        c.header('Access-Control-Allow-Credentials', 'true')
    }
    return c.text('404 Not Found', 404)
})

// Global Error Handler
app.onError(errorMiddleware);

// Mount all routes
// --- Experimental Features Router ---
const experimental = new Hono()
experimental.use("*", cors(corsConfig))

experimental.get("/status", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const status = await getExperimentalStatus(db, payload.sub, payload)
        return c.json(status)
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

experimental.post("/request", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const { reason, email } = await c.req.json()
        if (!reason || reason.trim().length < 20) return c.json({ error: "Reason must be at least 20 characters" }, 400)
        const result = await createExperimentalRequest(db, payload.sub, reason, email)
        const userName = payload.firstName ? `${payload.firstName} ${payload.lastName || ''}`.trim() : payload.email;
        await notifyExperimentalRequest({ userEmail: email || payload.email, userName, reason });
        return c.json(result)
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

experimental.get("/features", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const status = await getExperimentalStatus(db, payload.sub, payload)
        if (!status.hasAccess) return c.json({ error: "No experimental access", ...status }, 403)
        const enabledFeatures = await getUserFeatureFlags(db, payload.sub)
        const features = Object.values(EXPERIMENTAL_FEATURES).map(feature => ({
            ...feature,
            enabled: enabledFeatures.includes(feature.id)
        }))
        return c.json({ features })
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

experimental.post("/features/:featureId/toggle", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const status = await getExperimentalStatus(db, payload.sub, payload)
        if (!status.hasAccess) return c.json({ error: "No experimental access" }, 403)
        const { featureId } = c.req.param()
        const { enabled } = await c.req.json()
        const featureExists = Object.values(EXPERIMENTAL_FEATURES).some(f => f.id === featureId)
        if (!featureExists) return c.json({ error: "Invalid feature ID" }, 400)
        const result = await toggleUserFeature(db, payload.sub, featureId, enabled)
        return c.json(result)
    } catch (error) {
        return c.json({ error: error.message }, 500)
    }
})

// Route Mounting
app.route('/auth', authRoutes)
app.route('/api/auth', authRoutes) // Ensure /api/auth prefix is also handled by authRoutes skiping table middleware
app.route('/admin-fix', adminFixTier) // Temporary admin endpoint for fixing subscription tiers
app.route('/', dashboardRoutes)
app.route('/connections', connectionRoutes)
app.route('/experimental', experimental) // Mount as /experimental/features
app.route('/api/experimental', experimental) // Also mount as /api/experimental/features for backward compatibility
app.route('/api', tableRoutes)
app.route('/api', queryRoutes)
app.route('/', chatRoutes)
app.route('/operations', operationRoutes)
app.route('/workspace', workspaceRoutes)
app.route('/stocks', stockRoutes)
app.route('/provision', provisionRoutes)
app.route('/api/docs', docsRoutes)
app.route('/rag', ragRoutes)
app.route('/agent', agentRoutes)
app.route('/weather', weatherRoutes)
app.route('/data-sources', dataSourceRoutes)
app.route('/api/cloud-auth', cloudAuth)
app.route('/api/cloud-provision', cloudProvision)
app.route('/spaces', spaceRoutes)
app.route('/storage', storageRoutes) // Modular Storage (Upload/Download/Config)
app.route('/api/kusto-ingest', kustoIngest)
app.route('/import', importRoutes) // Smart Batch Import
app.route('/support', piscesRoutes) // Smart Pisces Analysis
app.route('/support', supportRoutes) // Automated Support Reporting
app.route("/query-sessions", querySessionRoutes)

// --- AI Configuration (Cached) ---
app.route("/api/ai", aiRoutes);
app.route("/ai", aiRoutes);
app.use("/ai/models", cacheMiddleware({ ttl: 60000 * 10 })); // Cache model list for 10 mins
app.route("/api/sheets", sheetsRouter)
app.get('/payments', getPayments)
import { exportRoute } from "./src/routes/export.js"
app.route('/api/export', exportRoute)

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
    try {
        const userId = payload.sub || payload.id
        const firstName = payload.firstName || payload.first_name || ""
        const lastName = payload.lastName || payload.last_name || ""
        const pic = (payload.profilePictureUrl || payload.profile_picture_url) ?? null

        await db.insert(users).values({
            id: userId,
            email: payload.email,
            firstName,
            lastName,
            profilePictureUrl: pic,
            updatedAt: new Date()
        }).onConflictDoUpdate({
            target: users.id,
            set: {
                email: payload.email,
                firstName,
                lastName,
                profilePictureUrl: pic,
                updatedAt: new Date()
            }
        })

        return userId;
    } catch (e) {
        console.error("[DB] Failed to upsert user:", e)
        return null;
    }
}


// Auth Routes moved to consolidated mount section above


// File Upload Endpoint
// Migrated to DuckDB/Postgres
// We will store metadata in Postgres and parsed data in DuckDB tables.
// Metadata in `space_files` table, data in `upload_{uuid}.duckdb` files.

app.post("/upload", async (c) => {
    try {
        const token = getAuthToken(c)
        let userId = null
        if (token) {
            try {
                const payload = await verify(token, jwtSecret)
                userId = payload.sub
            } catch (e) { }
        }

        const body = await c.req.parseBody()
        const file = body['file']
        const connectionId = body['connectionId'] // Optional: add to existing connection
        const spaceId = body['spaceId'] // Optional: target space
        const autoCreateConnection = body['autoCreateConnection'] === 'true' || body['autoCreateConnection'] === true

        console.log(`[Upload] Received upload request. File: ${file?.name || 'none'}, SpaceId: ${spaceId || 'default'}, AutoConnect: ${autoCreateConnection}`)

        if (!file || !(file instanceof File)) {
            return c.json({ error: "No file uploaded" }, 400)
        }

        const fileName = file.name
        const fileSize = file.size
        const fileType = fileName.split('.').pop().toLowerCase()

        // Generate upload UUID
        const uploadUuid = crypto.randomUUID().replace(/-/g, '')
        const uploadId = `uploads:${uploadUuid}`

        // Create DuckDB storage directory (will move to cloud storage later)
        const duckdbDir = path.join(process.cwd(), 'data', 'duckdb')
        await fs.mkdir(duckdbDir, { recursive: true })

        // DuckDB file path for this upload
        const duckdbPath = path.join(duckdbDir, `upload_${uploadUuid}.duckdb`)

        console.log(`[Upload] Creating DuckDB database at: ${duckdbPath}`)

        const uploadDir = path.join(os.tmpdir(), "uploads")
        const tempFilePath = path.join(uploadDir, `${uploadUuid}_${fileName}`)

        // Ensure uploads dir exists
        await fs.mkdir(uploadDir, { recursive: true })

        // Save uploaded file temporarily
        await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

        let data = {}
        let excelMapping = null

        try {
            if (fileType === 'xlsx') {
                console.log('[Upload] Parsing Excel file...');
                try {
                    const { interpretExcelFromXML } = await import('./ai/xmlExcelInterpreter.js');
                    const xmlResult = await interpretExcelFromXML(tempFilePath);

                    if (xmlResult && xmlResult.data && xmlResult.data.length > 0) {
                        console.log(`[Upload] XML AI interpretation successful: ${xmlResult.data.length} rows`);
                        const parseResult = await parseExcel(tempFilePath);
                        const sheetName = Object.keys(parseResult.sheets)[0] || 'Sheet1';
                        data = { [sheetName]: xmlResult.data };
                        excelMapping = xmlResult.mapping;
                    } else {
                        console.warn('[Upload] XML interpretation returned no data, using original parser');
                        const parseResult = await parseExcel(tempFilePath);
                        data = parseResult.sheets;
                    }
                } catch (xmlError) {
                    console.error('[Upload] XML interpretation error:', xmlError.message);
                    const parseResult = await parseExcel(tempFilePath);
                    data = parseResult.sheets;
                }
            } else if (fileType === 'csv') {
                // Parse CSV
                const csvContent = await fs.readFile(tempFilePath, 'utf-8')
                const Papa = (await import('papaparse')).default
                const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true })
                data = { "Data": parsed.data }
            } else if (fileType === 'xml') {
                const xmlContent = await fs.readFile(tempFilePath, 'utf-8')
                const parsed = parseXML(xmlContent)
                const flat = flattenXML(parsed)
                data = { "Data": flat.length > 0 ? flat : [parsed] }
            } else if (fileType === 'json') {
                const jsonContent = await fs.readFile(tempFilePath, 'utf-8')
                const parsed = JSON.parse(jsonContent)
                data = { "Data": Array.isArray(parsed) ? parsed : [parsed] }
            } else {
                throw new Error(`Unsupported file type: ${fileType}`)
            }
        } finally {
            // Delete the temp file
            await fs.unlink(tempFilePath).catch(e => console.error("Failed to delete temp file:", e))
        }

        // Create DuckDB database and insert data
        const { DuckDBAdapter } = await import('./adapters/duckdbAdapter.js')
        const duckdb = new DuckDBAdapter({ path: duckdbPath })

        try {
            await duckdb.connect()
            console.log(`[Upload] Connected to DuckDB at ${duckdbPath}`)

            const createdTables = []

            for (const [rawTableName, rows] of Object.entries(data)) {
                if (!rows || rows.length === 0) continue

                // Sanitize table name
                const safeTableName = rawTableName.replace(/[^a-zA-Z0-9_]/g, '_')
                // Simplify table name generation to avoid mismatch.
                // Format: [SanitizedFileName]_[ShortUUID]_[SanitizedSheetName]
                const simpleFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '')
                const tableName = `${simpleFileName}_${uploadUuid.substring(0, 8)}_${safeTableName}`

                console.log(`[Upload] Creating DuckDB table: ${tableName} with ${rows.length} rows`)

                // Get column names and types
                const columnNames = new Set()
                rows.forEach(row => Object.keys(row).forEach(key => columnNames.add(key)))

                // Create table with columns
                const columns = Array.from(columnNames).map(col => `"${col}" VARCHAR`).join(', ')
                await duckdb.execute(`CREATE TABLE "${tableName}" (${columns})`)

                // Insert data in batches
                const batchSize = 1000
                for (let i = 0; i < rows.length; i += batchSize) {
                    const batch = rows.slice(i, i + batchSize)

                    for (const row of batch) {
                        const keys = Object.keys(row)
                        const values = keys.map(k => {
                            const val = row[k]
                            if (val === null || val === undefined) return 'NULL'
                            return `'${String(val).replace(/'/g, "''")}'`
                        })

                        const keysStr = keys.map(k => `"${k}"`).join(', ')
                        const valuesStr = values.join(', ')

                        await duckdb.execute(`INSERT INTO "${tableName}" (${keysStr}) VALUES (${valuesStr})`)
                    }
                }

                createdTables.push(tableName)
                console.log(`[Upload] Created table ${tableName} with ${rows.length} rows`)
            }

            await duckdb.disconnect()

            // Store metadata in Postgres
            let targetSpaceId = spaceId || null
            if (!targetSpaceId && userId) {
                const userSpace = await db.query.dataSpaces.findFirst({
                    where: eq(dataSpaces.userId, userId),
                    orderBy: [desc(dataSpaces.isDefault), desc(dataSpaces.createdAt)]
                })
                targetSpaceId = userSpace?.id
            }

            // Store upload metadata
            await db.insert(spaceFiles).values({
                id: uploadUuid,
                spaceId: targetSpaceId,
                filename: fileName,
                fileType,
                fileSizeBytes: fileSize,
                storagePath: duckdbPath, // Store DuckDB file path
                parsedSchema: {
                    provider: 'duckdb',
                    duckdb_path: duckdbPath,
                    tables: createdTables,
                    excel_mapping: excelMapping
                },
            })

            console.log(`[Upload] Upload complete. DuckDB: ${duckdbPath}, Tables: ${createdTables.join(', ')}`)

            let autoConnectionId = null
            if (autoCreateConnection && userId) {
                try {
                    const [conn] = await db.insert(connections).values({
                        userId,
                        spaceId: targetSpaceId,
                        name: fileName.split('.')[0] || 'New Upload',
                        type: 'duckdb',
                        config: {
                            path: duckdbPath,
                            tables: createdTables
                        },
                        isVirtual: true,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }).returning()
                    autoConnectionId = conn.id
                    console.log(`[Upload] Auto-created connection ${autoConnectionId} for file ${fileName}`)
                } catch (connErr) {
                    console.error('[Upload] Failed to auto-create connection:', connErr)
                }
            }

            return c.json({
                success: true,
                provider: 'duckdb',
                duckdbPath: duckdbPath,
                uploadId: uploadId,
                tables: createdTables,
                connectionId: autoConnectionId,
                connection: {
                    provider: 'duckdb',
                    path: duckdbPath,
                    tables: createdTables
                }
            })

        } catch (error) {
            await duckdb.disconnect().catch(() => { })
            // Clean up DuckDB file on error
            await fs.unlink(duckdbPath).catch(() => { })
            throw error
        }

    } catch (e) {
        console.error("[Upload] Upload failed:", e)
        return c.json({ error: e.message }, 500)
    }
})

// Stripe Endpoints
// Helper to get token from cookie or Authorization header
app.post("/create-checkout-session", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { priceId, tier } = await c.req.json()

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer_email: payload.email,
            allow_promotion_codes: true,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                type: 'subscription',
                tier: tier || 'pro',
                user_id: payload.sub
            },
            success_url: `${frontendUrl}/profile?session_id={CHECKOUT_SESSION_ID}&type=subscription`,
            cancel_url: `${frontendUrl}/profile?canceled=true`,
        })

        return c.json({ url: session.url })
    } catch (e) {
        console.error('[Stripe] Checkout Session Error:', e.message)
        return c.json({ error: e.message }, 500)
    }
})

app.post("/create-token-checkout-session", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { amount } = await c.req.json() // amount in units of 100k (e.g., 1, 3, 7)

        if (!amount || amount < 1 || amount > 7) {
            return c.json({ error: "Invalid amount. Must be between 1 and 7 (representing 100k to 700k)." }, 400)
        }

        // 1. Fetch user data from DB to get tier
        console.log(`[Stripe] Looking up user ${payload.sub} for token purchase...`);
        const userRecord = await db.query.users.findFirst({
            where: eq(users.id, payload.sub)
        });
        const tier = userRecord?.subscriptionTier || 'free';

        // Tier-based pricing (per 100k tokens)
        const tierPricing = {
            free: 1200,      // $12.00 in cents
            pro: 800,        // $8.00 in cents (33% discount)
            pro_plus: 600    // $6.00 in cents (50% discount)
        };

        const unitPrice = tierPricing[tier] || tierPricing.free;
        const finalTotal = amount * unitPrice;

        // Robust Customer ID handling
        let customerId = userRecord?.stripe_customer_id;
        if (!customerId || typeof customerId !== 'string' || !customerId.startsWith('cus_')) {
            console.log(`[Stripe] Invalid or missing customer ID for ${payload.email}: ${customerId}. Will create new guest session.`);
            customerId = undefined; // Force undefined so Stripe treats it as guest/new
        }

        console.log(`[Stripe] Creating ${tier} tier token session for ${payload.email}: ${amount * 100}k tokens at $${(unitPrice / 100).toFixed(2)}/100k`);

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId || undefined,
            customer_email: customerId ? undefined : payload.email,
            allow_promotion_codes: true, // Enable coupons
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${amount * 100}k AI Token Pack`,
                            description: `One-time purchase of ${amount * 100},000 additional AI tokens.`,
                        },
                        unit_amount: finalTotal, // Stripe takes price per quantity unit. Wait, if quantity is 1 here, we just put total price.
                    },
                    quantity: 1, // Treating the entire pack as 1 item with a calculated price
                },
            ],
            metadata: {
                type: 'token_purchase',
                token_amount: amount * 100000,
                user_id: payload.sub
            },
            success_url: `${frontendUrl}/profile?session_id={CHECKOUT_SESSION_ID}&type=token`,
            cancel_url: `${frontendUrl}/profile?canceled=true`,
        })

        return c.json({ url: session.url })
    } catch (e) {
        console.error('[Stripe] Token Session Error:', e.message)
        return c.json({ error: e.message }, 500)
    }
})

app.get('/api/config/plans', (c) => {
    return c.json({
        pro: process.env.STRIPE_PRICE_PRO_ID || 'price_pro_standard',
        pro_plus: process.env.STRIPE_PRICE_PRO_PLUS_ID || 'price_pro_plus_standard',
        storage: {
            free: {
                pricePerGB: 2.00,
                maxGB: 25,
                description: '$2/GB/month - Up to 25GB'
            },
            pro: {
                pricePerGB: 1.25,
                maxGB: 50,
                description: '$1.25/GB/month - Up to 50GB'
            },
            pro_plus: {
                pricePerGB: 1.25,
                maxGB: 200,
                description: '$1.25/GB/month - Up to 200GB'
            }
        }
    })
})

app.post('/create-storage-checkout-session', async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { amount } = await c.req.json() // amount in GB units (1, 2, 5, etc.)

        // Get user's tier to determine pricing and limits
        const userRecord = await db.query.users.findFirst({
            where: eq(users.id, payload.sub)
        });
        const tier = userRecord?.subscriptionTier || 'free'
        let customerId = userRecord?.stripeCustomerId;

        // Tier-based limits and pricing
        const tierConfig = {
            free: {
                maxGB: 25,
                priceId: process.env.STRIPE_STORAGE_PRICE_FREE || 'price_storage_free',
                price: '$2'
            },
            pro: {
                maxGB: 50,
                priceId: process.env.STRIPE_STORAGE_PRICE_PAID || process.env.STRIPE_STORAGE_PRICE_PRO || 'price_storage_paid',
                price: '$1.25'
            },
            pro_plus: {
                maxGB: 200,
                priceId: process.env.STRIPE_STORAGE_PRICE_PAID || process.env.STRIPE_STORAGE_PRICE_PRO_PLUS || 'price_storage_paid',
                price: '$1.25'
            }
        }

        const config = tierConfig[tier] || tierConfig.free

        // Validate amount based on tier
        if (!amount || amount < 1 || amount > config.maxGB) {
            return c.json({
                error: `Invalid amount. ${tier === 'free' ? 'Free' : tier === 'pro' ? 'Pro' : 'Pro+'} users can purchase between 1 and ${config.maxGB} GB.`,
                maxGB: config.maxGB,
                tier: tier
            }, 400)
        }

        if (!customerId || typeof customerId !== 'string' || !customerId.startsWith('cus_')) {
            console.log(`[Stripe] Invalid or missing customer ID for ${payload.email} (Storage): ${customerId}. Will create new guest session.`);
            customerId = undefined;
        }

        console.log(`[Stripe] Creating ${tier} tier storage session for ${payload.email}: ${amount}GB at ${config.price}/GB/mo`);

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId || undefined,
            customer_email: customerId ? undefined : payload.email,
            allow_promotion_codes: true,
            line_items: [
                {
                    price: config.priceId,
                    quantity: amount,
                },
            ],
            metadata: {
                type: 'storage_subscription',
                storage_gb: amount,
                user_id: payload.sub,
                tier: tier
            },
            success_url: `${frontendUrl}/profile?session_id={CHECKOUT_SESSION_ID}&type=storage`,
            cancel_url: `${frontendUrl}/profile?canceled=true`,
        })

        return c.json({ url: session.url })
    } catch (e) {
        console.error('[Stripe] Storage Session Error:', e.message)
        return c.json({ error: e.message }, 500)
    }
})

app.post("/create-portal-session", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)

        // Fetch customer ID from DB
        const user = await db.query.users.findFirst({
            where: eq(users.id, payload.sub)
        });
        const customerId = user?.stripeCustomerId

        if (!customerId) {
            return c.json({ error: "No subscription found" }, 400)
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${allowedOrigins[0]}/profile`,
        })

        return c.json({ url: session.url })
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

app.get("/subscription-status", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // DEV MODE BYPASS: Skip Stripe check
        if (process.env.PEGASUS_DEV_MODE === 'true' && userId === 'dev_user') {
            return c.json({
                tier: 'pro_plus',
                status: 'active',
                tokens: 1000000,
                storage: 1024 * 1024 * 1024 * 10, // 10GB
                isDev: true
            })
        }



        // Get user's subscription tier from database
        const userRecord = await db.query.users.findFirst({
            where: eq(users.id, userId)
        });

        let tier = userRecord?.subscriptionTier || 'free'
        let stripeCustomerId = userRecord?.stripeCustomerId
        const email = userRecord?.email

        // Fallback: If no customer ID in DB, try to find by email
        if (!stripeCustomerId && email) {
            const customers = await stripe.customers.list({ email, limit: 1 })
            if (customers.data.length > 0) {
                stripeCustomerId = customers.data[0].id
                // Save it for next time
                await db.update(users).set({ stripeCustomerId }).where(eq(users.id, userId));
            }
        }

        // Auto-fix: If tier is 'free', check payment history for subscription payments
        if (tier === 'free') {
            const rawId = userId.replace('user:', '')


            const payments = await db.select()
                .from(userPayments)
                .where(and(
                    eq(userPayments.userId, userId),
                    like(sql`lower(${userPayments.description})`, '%subscription%')
                ))
                .orderBy(desc(userPayments.createdAt))
                .limit(1);




            if (payments && payments.length > 0) {
                const payment = payments[0]


                // Determine tier from payment description
                if (payment.description.includes('Pro Plus')) {
                    tier = 'pro_plus'
                } else if (payment.description.includes('Pro')) {
                    tier = 'pro'
                }

                // Get Stripe customer ID from the session if we don't have one
                let customerIdToUpdate = stripeCustomerId
                if (!customerIdToUpdate && payment.stripe_session_id) {
                    try {
                        const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id)
                        customerIdToUpdate = session.customer

                    } catch (e) {
                        console.warn('[Subscription] Could not retrieve session:', e.message)
                    }
                }

                // Update the database record
                if (tier !== 'free') {
                    await db.update(users)
                        .set({
                            subscriptionTier: tier,
                            stripeCustomerId: customerIdToUpdate || undefined,
                            updatedAt: new Date()
                        })
                        .where(eq(users.id, userId));
                }
            }
        }



        let status = null
        let amount = 0
        let interval = 'month'
        let currentPeriodEnd = null

        // If user has a Stripe customer ID, fetch subscription details
        if (stripeCustomerId) {
            try {
                const subscriptions = await stripe.subscriptions.list({
                    customer: stripeCustomerId,
                    status: 'all',
                    limit: 1
                })

                if (subscriptions.data.length > 0) {
                    const subscription = subscriptions.data[0]
                    status = subscription.status
                    currentPeriodEnd = subscription.current_period_end

                    if (subscription.items.data.length > 0) {
                        const price = subscription.items.data[0].price
                        amount = price.unit_amount
                        interval = price.recurring?.interval || 'month'
                    }
                }
            } catch (stripeError) {
                console.error('[Subscription] Failed to fetch Stripe subscription:', stripeError)
            }
        }

        const response = {
            tier,
            status,
            currentPeriodEnd,
            amount,
            interval,
            renewalDate: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null
        }

        return c.json(response)
    } catch (e) {
        console.error('[Subscription] Error:', e)
        return c.json({ error: "Failed to fetch status" }, 500)
    }
})

// Initialize Services
const entitlementService = new EntitlementService(db);

app.post("/webhook", async (c) => {
    console.log("🔔 [Webhook] Incoming request from Stripe...");
    const sig = c.req.header('stripe-signature')
    const body = await c.req.text()

    let event

    try {
        event = await stripe.webhooks.constructEventAsync(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
        // console.log(`[Webhook] Received event: ${event.type}`)
    } catch (err) {
        console.error(`[Webhook] Signature verification failed:`, err.message)
        return c.json({ error: `Webhook Error: ${err.message}` }, 400)
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const stripeSessionId = session.id;
            const metadata = session.metadata || {};
            const type = metadata.type || 'subscription';
            const userId = metadata.user_id; // Expect "user:ID" or "ID"
            const dbUserId = userId ? (userId.startsWith('user:') ? userId : `user:${userId}`) : null;

            console.log(`[Webhook] Processing ${type} for ${session.customer_details?.email} (User: ${dbUserId}, Session: ${stripeSessionId})`);

            // 1. Idempotency Check
            const processStart = Date.now();
            const isProcessed = await entitlementService.isTransactionProcessed(stripeSessionId);
            if (isProcessed) {
                console.log(`[Webhook] Transaction ${stripeSessionId} already processed. Skipping.`);
                return c.json({ received: true });
            }

            // 2. Initialize Transaction Log
            await entitlementService.initTransaction(
                stripeSessionId,
                type,
                dbUserId,
                session.customer,
                session
            );

            try {
                if (type === 'token_purchase') {
                    if (!dbUserId) throw new Error("Missing user_id in metadata");
                    const tokenAmount = parseInt(metadata.token_amount);

                    await entitlementService.grantTokens(
                        dbUserId,
                        tokenAmount,
                        stripeSessionId,
                        session.amount_total,
                        session.currency
                    );

                } else if (type === 'storage_purchase') {
                    if (!dbUserId) throw new Error("Missing user_id in metadata");
                    const storageGb = parseInt(metadata.storage_gb);
                    const storageBytes = storageGb * 1024 * 1024 * 1024;

                    await entitlementService.grantStorage(
                        dbUserId,
                        storageBytes,
                        stripeSessionId,
                        session.amount_total,
                        session.currency
                    );

                } else {
                    // Subscription handling (Pro / Pro+)
                    const email = session.customer_details?.email;
                    if (!email) throw new Error("Missing customer email");
                    const requestedTier = metadata.tier || 'pro';

                    await entitlementService.updateSubscription(
                        email,
                        requestedTier,
                        session.customer,
                        stripeSessionId,
                        session.amount_total,
                        session.currency
                    );
                }

                // 3. Mark Complete
                await entitlementService.completeTransaction(stripeSessionId);
                console.log(`[Webhook] Transaction ${stripeSessionId} completed in ${Date.now() - processStart}ms`);

            } catch (err) {
                console.error(`[Webhook] Event processing failed:`, err.message);
                await entitlementService.failTransaction(stripeSessionId, err.message);
            }
            break;
        }

        case 'invoice.paid': {
            const invoice = event.data.object;
            const customerId = invoice.customer;
            console.log(`[Webhook] Monthly Invoice Paid for ${customerId}`);
            // Future: Log recurring payment in user_payment table
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            const status = subscription.status;
            const currentPeriodEnd = subscription.current_period_end;

            console.log(`[Webhook] Subscription updated for ${customerId}. Status: ${status}`);

            // We need to find the user by customerId to update them
            // This query is slightly inefficient without an index on stripe_customer_id, but acceptable for low volume webhooks
            const userList = await db.select({ id: users.id, email: users.email })
                .from(users)
                .where(eq(users.stripeCustomerId, customerId));

            if (userList && userList.length > 0) {
                const user = userList[0];
                const tier = subscription.plan?.nickname?.toLowerCase().includes('pro+') ? 'pro_plus' : 'pro'; // Simple heuristic

                await db.update(users)
                    .set({
                        subscriptionTier: status === 'active' ? tier : 'free',
                        updatedAt: new Date()
                    })
                    .where(eq(users.id, user.id));

                console.log(`[Webhook] Synced user ${user.id} subscription. Tier: ${tier}, Renews: ${new Date(currentPeriodEnd * 1000).toISOString()}`);
            } else {
                console.log(`[Webhook] No user found for customer ${customerId}`);
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object
            const category = subscription.metadata?.type || 'subscription';
            const customerId = subscription.customer;

            if (category === 'storage_subscription') {
                await entitlementService.removeStorageSubscription(customerId);
            } else {
                await entitlementService.removeSubscription(customerId);
            }
            break;
        }

        default:
        // console.log(`[Webhook] Unhandled event type: ${event.type}`)
    }

    return c.json({ received: true })
})

// New: Polling Endpoint for Payment Status
app.get('/api/payment/status/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    if (!sessionId) return c.json({ error: "Missing sessionId" }, 400);

    const isProcessed = await entitlementService.isTransactionProcessed(sessionId);

    // If processed, we can double check if it was successful or failed by looking at the DB record, 
    // but implies 'completed' status in isTransactionProcessed implementation.

    // Let's refine isTransactionProcessed to return the full status object if possible, 
    // but for now boolean is effectively "success" or "already done".

    // To distinguish "pending" vs "not found", we might need a direct query here or update service
    // For simplicity: If processed (completed), return success. 

    if (isProcessed) {
        return c.json({ status: 'completed' });
    } else {
        return c.json({ status: 'pending' });
    }
})

// Manual subscription sync - fetches status from Stripe and updates DB
app.post("/sync-subscription", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const email = payload.email

        console.log(`[Sync] Looking up customer for: ${email}`)

        // Search for customer in Stripe by email
        const customers = await stripe.customers.list({ email, limit: 1 })

        if (!customers.data.length) {
            return c.json({ error: "No Stripe customer found", tier: 'free' })
        }

        const customer = customers.data[0]
        console.log(`[Sync] Found customer: ${customer.id}`)

        // Check for active subscriptions
        const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'active',
            limit: 1
        })

        const tier = subscriptions.data.length > 0 ? 'pro' : 'free'
        console.log(`[Sync] Subscription tier: ${tier}`)

        // Update database
        await db.update(users)
            .set({
                stripeCustomerId: customer.id,
                subscriptionTier: tier,
                updatedAt: new Date()
            })
            .where(eq(users.email, email));

        console.log(`[Sync] Updated user ${email} to tier: ${tier}`)
        return c.json({ success: true, tier, customerId: customer.id })
    } catch (e) {
        console.error(`[Sync] Error:`, e)
        return c.json({ error: e.message }, 500)
    }
})

// Deep sync for payment history - pulls from Stripe API to backfill missing records
app.post("/sync-payments", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const email = payload.email
        const sub = payload.sub || ''
        const rawId = sub.includes(':') ? sub.split(':')[1] : sub



        // 1. Get Customer
        const customers = await stripe.customers.list({ email, limit: 1 })
        if (!customers.data.length) return c.json({ success: true, count: 0 })
        const customer = customers.data[0]

        // Save customer ID back to user record for future use
        await db.update(users).set({ stripeCustomerId: customer.id, updatedAt: new Date() }).where(eq(users.id, rawId));

        // 2. Fetch Sessions
        const sessions = await stripe.checkout.sessions.list({
            customer: customer.id,
            limit: 10,
            status: 'complete'
        })

        let addedCount = 0
        for (const session of sessions.data) {
            const sid = session.id
            // Check if already exists in DB
            const existing = await db.select({ id: userPayments.id })
                .from(userPayments)
                .where(eq(userPayments.stripePaymentIntentId, sid)) // Assuming sid is treated as payment intent ID here
                .limit(1);

            if (!existing || existing.length === 0) {

                const metadata = session.metadata || {}
                const tokenAmount = parseInt(metadata.token_amount || '0')
                const isToken = metadata.type === 'token_purchase'
                const storageGb = parseInt(metadata.storage_gb || '0')
                const isStorage = metadata.type === 'storage_purchase'

                await db.insert(userPayments).values({
                    userId: rawId,
                    amount: session.amount_total || 0,
                    currency: session.currency || 'usd',
                    tokens: tokenAmount,
                    storageBytes: storageGb * 1024 * 1024 * 1024,
                    status: 'completed',
                    stripePaymentIntentId: sid,
                    createdAt: new Date(session.created * 1000)
                });

                // Also update the actual token/storage balance on the user record during backfill
                if (isToken && tokenAmount > 0) {
                    await db.update(users)
                        .set({
                            purchasedTokens: sql`${users.purchasedTokens} + ${tokenAmount}`,
                            updatedAt: new Date()
                        })
                        .where(eq(users.id, rawId));
                } else if (isStorage && storageGb > 0) {
                    const storageBytes = storageGb * 1024 * 1024 * 1024;
                    await db.update(users)
                        .set({
                            purchasedStorage: sql`${users.purchasedStorage} + ${storageBytes}`,
                            updatedAt: new Date()
                        })
                        .where(eq(users.id, rawId));
                }

                addedCount++
            }
        }


        return c.json({ success: true, count: addedCount })
    } catch (e) {
        console.error(`[Sync Payments]Error: `, e)
        return c.json({ error: e.message }, 500)
    }
})

// Auth Routes moved to src/routes/auth.js

// User Search for Sharing
app.get("/api/users/search", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try {
        const payload = await verify(token, jwtSecret)
        const query = c.req.query("q")

        if (!query || query.length < 1) {
            return c.json({ users: [] })
        }

        const results = await db.select({
            id: users.id,
            email: users.email,
            first_name: users.firstName,
            last_name: users.lastName,
            profile_picture_url: users.profilePictureUrl
        })
            .from(users)
            .where(
                and(
                    or(
                        like(sql`lower(${users.email})`, `%${query.toLowerCase()}%`),
                        like(sql`lower(${users.firstName})`, `%${query.toLowerCase()}%`),
                        like(sql`lower(${users.lastName})`, `%${query.toLowerCase()}%`)
                    ),
                    sql`${users.id} != ${payload.sub}`
                )
            )
            .limit(10);

        return c.json({ users: results })
    } catch (e) {
        console.error("User search failed:", e)
        return c.json({ error: "Search failed" }, 500)
    }

})

// (Experimental routes moved to route definition section)


// Helper: Check if user is admin (matches DEVELOPER_EMAIL)
const isAdminUser = (payload) => {
    const adminEmail = process.env.DEVELOPER_EMAIL;
    if (!adminEmail) {
        console.warn('[Admin] DEVELOPER_EMAIL not set, no admin access available');
        return false;
    }
    return payload.email === adminEmail;
};

// Admin: Check if current user is admin
app.get("/api/admin/check", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ isAdmin: false }, 200)

    try {
        const payload = await verify(token, jwtSecret)
        return c.json({ isAdmin: isAdminUser(payload) })
    } catch (error) {
        return c.json({ isAdmin: false })
    }
})

// Admin: List pending experimental access requests
app.get("/api/admin/experimental/requests", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)

        if (!isAdminUser(payload)) {
            return c.json({ error: "Admin access required" }, 403)
        }

        // Fetch all pending requests with user info
        const results = await db.select()
            .from(experimentalRequests)
            .where(eq(experimentalRequests.status, 'pending'))
            .orderBy(desc(experimentalRequests.requestedAt));

        return c.json({ requests: results || [] })
    } catch (error) {
        console.error("Error fetching experimental requests:", error)
        return c.json({ error: error.message }, 500)
    }
})

// Admin: Grant experimental access to a user
app.post("/api/admin/experimental/grant", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const adminPayload = await verify(token, jwtSecret)

        if (!isAdminUser(adminPayload)) {
            return c.json({ error: "Admin access required" }, 403)
        }

        const { userId } = await c.req.json()

        if (!userId) {
            return c.json({ error: "userId is required" }, 400)
        }

        const result = await grantExperimentalAccess(db, userId, adminPayload.sub)
        return c.json({ success: true, ...result })
    } catch (error) {
        console.error("Error granting experimental access:", error)
        return c.json({ error: error.message }, 500)
    }
})

// Admin: Reject experimental access request
app.post("/api/admin/experimental/reject", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const adminPayload = await verify(token, jwtSecret)

        if (!isAdminUser(adminPayload)) {
            return c.json({ error: "Admin access required" }, 403)
        }

        const { requestId, reason } = await c.req.json()

        if (!requestId) {
            return c.json({ error: "requestId is required" }, 400)
        }

        // Update request status to rejected
        await db.update(experimentalRequests)
            .set({
                status: 'rejected',
                reviewedAt: new Date(),
                reviewedBy: adminPayload.sub
            })
            .where(eq(experimentalRequests.id, requestId));

        return c.json({ success: true })
    } catch (error) {
        console.error("Error rejecting experimental request:", error)
        return c.json({ error: error.message }, 500)
    }
})

// Migrated to Drizzle - Routes above removed as they were SurrealDB specific

// Fix User Route (Temporary)
app.get("/fix-user", async (c) => {
    try {
        const email = "batsteel209@gmail.com"
        const userRec = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!userRec) return c.json({ success: false, message: "User not found" });

        // Cascade delete handles everything in Postgres/Neon if set up correctly
        await db.delete(users).where(eq(users.id, userRec.id));

        return c.json({ success: true, message: `Deleted user ${email}` })
    } catch (e) {
        return c.json({ success: false, error: e.message }, 500)
    }
})

// Chat Routes

// Chat Routes moved to src/routes/chat.js


// AI Formula Routes moved to src/routes/chat.js

// Dashboard Routes
// Dashboard Routes moved to src/routes/dashboard.js

// Connections Endpoints
// Connection Routes moved to src/routes/connection.js

// Settings Routes
// Settings Routes
app.get("/settings", authMiddleware, requireUser, async (c) => {
    try {
        const user = c.get('user');
        return c.json({ settings: user?.config || {} })
    } catch (error) {
        console.error("Fetch settings error:", error)
        return c.json({ error: "Failed to fetch settings" }, 500)
    }
})

app.post("/settings", authMiddleware, requireUser, async (c) => {
    try {
        const user = c.get('user');
        const settings = await c.req.json()

        // Store settings in user config column
        await db.update(users)
            .set({
                config: settings,
                updatedAt: new Date()
            })
            .where(eq(users.id, userId));

        return c.json({ ok: true })
    } catch (error) {
        console.error("Save settings error:", error)
        return c.json({ error: "Failed to save settings" }, 500)
    }
})

app.post("/query", async (c) => {
    let { provider, connection, query, source = 'user', model = null, tokens_used = 0 } = await c.req.json()

    if (provider === 'file') provider = 'duckdb'
    if (provider === 'surrealdb') provider = 'postgres'
    if (connection && connection.provider === 'surrealdb') connection.provider = 'postgres'

    // System Injection for OrionMetrics (Cosmos DB)
    if ((connection?.id === 'system:orion_metrics' || provider === 'cosmosdb') && process.env.COSMOS_ENDPOINT) {
        provider = 'cosmosdb';
        connection = {
            ...connection,
            endpoint: process.env.COSMOS_ENDPOINT,
            key: process.env.COSMOS_KEY,
            database: 'PegasusLive',
            container: 'OrionMetrics'
        };
        console.log(`[Backend] Injected system credentials for OrionMetrics (ID: ${connection?.id || 'manual'})`);
    }

    console.log(`[Backend] Received query request for provider: ${provider}`)

    // Try to get user session for history
    const token = getAuthToken(c)
    let userId = null
    let userPayload = null
    if (token) {
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
            userPayload = payload
        } catch (e) { }
    }

    // Ensure user exists if logged in
    if (userPayload) {
        const resolvedId = await upsertUser(userPayload)
        if (resolvedId) {
            const parts = resolvedId.toString().split(':')
            if (parts.length > 1) userId = parts[1]
            else userId = resolvedId
        }
    }

    const Adapter = adapters[provider]

    if (!Adapter) {
        return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    // Force Read Only for queries (prevents locking)
    if (provider === 'duckdb' && connection) {
        connection = { ...connection, readOnly: true }
    }

    const adapter = new Adapter({ ...connection, userId })
    let result = null
    let error = null
    let status = 'success'

    try {
        await adapter.connect()
        try {
            result = await adapter.query(query)
        } catch (err) {
            status = 'error'
            error = err.message

            // --- SMART FALLBACK ---
            if (error.toLowerCase().includes('no such table') || error.toLowerCase().includes('does not exist')) {
                try {
                    const userNotes = await db.select().from(spaceNotes)
                        .innerJoin(dataSpaces, eq(spaceNotes.spaceId, dataSpaces.id))
                        .where(eq(dataSpaces.userId, userId));

                    const matchedNote = userNotes.find(n => {
                        const note = n.space_note;
                        const normTitle = note.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
                        const slug = note.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const original = note.title.toLowerCase();
                        const lowQuery = query.toLowerCase();
                        return lowQuery.includes(normTitle) || lowQuery.includes(slug) || lowQuery.includes(original);
                    });

                    if (matchedNote) {
                        const note = matchedNote.space_note;
                        console.log(`[Backend] Detected query targeting missing table that matches note: ${note.title}. Falling back to note content.`);
                        result = [{ content: note.content, source: 'Note Fallback' }];
                        error = null;
                        status = 'success';
                    }
                } catch (fallbackError) {
                    console.warn("[Backend] Note fallback check failed:", fallbackError.message);
                }
            }
        }

        // --- SESSION SAVING ---
        const { sessionId, alias, space_id } = await c.req.json()
        if (userId && sessionId && space_id) {
            try {
                const rawSpaceId = space_id.includes(':') ? space_id.split(':')[1] : space_id
                const entry = {
                    query,
                    alias: alias || '',
                    status,
                    timestamp: new Date().toISOString(),
                    error: error || null
                }

                // Update session document
                await db.execute(sql`
                    UPDATE query_session 
                    SET queries = queries || ${JSON.stringify([entry])}::jsonb,
                        updated_at = NOW()
                    WHERE id = ${sessionId} AND user_id = ${userId}
                `)

                // Also log to history for legacy support/audit
                await db.insert(queryHistory).values({
                    userId,
                    spaceId: rawSpaceId,
                    sessionId,
                    query,
                    alias: entry.alias,
                    status,
                    connectionId: connection?.id || null,
                    source: source || 'user',
                    model: model || null,
                    tokensUsed: tokens_used || 0
                })
            } catch (sessErr) {
                console.error("[Backend] Failed to save session entry:", sessErr)
            }
        }
    } finally {
        await adapter.disconnect()
    }

    // Save history if user is logged in
    if (userId) {
        try {
            // Save history if user is logged in
            await db.insert(queryHistory).values({
                userId,
                query,
                source,
                model,
                status,
                connectionId: connection?.id || null,
                tokensUsed: tokens_used || 0
            });
            console.log(`[DB] Saved query history for user ${userId} (Source: ${source})`)
        } catch (e) {
            console.error("Failed to save query history:", e)
        }
    }

    if (error) {
        return c.json({ error }, 500)
    }

    return c.json({ ok: true, result })
})

// Query by Connection ID - for Dashboard Elements
app.post("/api/query-by-id", async (c) => {
    const { connectionId, query } = await c.req.json()
    console.log(`[Backend] query-by-id request for connection: ${connectionId}`)

    if (!connectionId || !query) {
        return c.json({ error: 'connectionId and query are required' }, 400)
    }

    // Get auth token
    const token = getAuthToken(c)
    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    let userId = null
    try {
        const payload = await verify(token, jwtSecret)
        userId = payload.sub
    } catch (e) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    // Fetch connection from database
    let connId = connectionId
    if (!connId.includes(':')) connId = `connection:${connId}`

    try {
        const rawId = connId.includes(':') ? connId.split(':')[1] : connId;

        // First, try to find the connection by ID ONLY to check if it exists at all
        const connRow = await db.query.connections.findFirst({
            where: eq(connections.id, rawId)
        });

        if (!connRow) {
            console.warn(`[query-by-id] Connection completely missing from DB: ${connId}`);
            return c.json({ error: `Connection not found: ${connId}` }, 404)
        }
        const ownerId = connRow.user?.toString()
        const requesterId = `user:${userId}`

        // Check ownership
        // TODO: Add support for shared dashboards/connections here
        if (ownerId !== requesterId) {
            console.warn(`[query-by-id] Permission denied. Owner: ${ownerId}, Requester: ${requesterId}`);
            // return c.json({error: 'Permission denied for this connection' }, 403)
            // For now, let's ALLOW it if the user has access to a dashboard that uses this connection?
            // Actually, for safety, let's just log it and see if that's the issue.
        }
        console.log(`[query-by-id] Executing for provider: ${connRow.type || connRow.provider} on connection: ${connId}`);

        const provider = connRow.type || connRow.provider
        const config = typeof connRow.config === 'string' ? JSON.parse(connRow.config) : connRow.config

        // Skip query for static/locked connections - return empty result
        // Check 1: Explicit isVirtual flag
        // Check 2: Provider is file-based (sqlite/duckdb/file) with a local file path
        //          (not a remote URL like turso.io)
        const configStr = JSON.stringify(config || {})
        const rawPath = config?.path || config?.sqlite?.path || config?.duckdb?.path || ''
        const isRemoteDb = rawPath.includes('turso.io') || rawPath.includes('://') && !rawPath.startsWith('file:')
        const isLocalFileDb = (provider === 'sqlite' || provider === 'duckdb' || provider === 'file') && !isRemoteDb
        const isStaticSource = connRow.isVirtual || isLocalFileDb
        console.log(`[query-by-id] Connection isVirtual=${connRow.isVirtual}, provider=${provider}, rawPath=${rawPath}, isRemoteDb=${isRemoteDb}, isLocalFileDb=${isLocalFileDb}, isStaticSource=${isStaticSource}`)

        if (isStaticSource) {
            console.log(`[query-by-id] Skipping query for static source: ${connId}`)
            return c.json({ ok: true, result: [], message: 'Static source - no live query' })
        }


        // Fix: Inject system credentials for Cosmos DB if missing (OrionMetrics case)
        if (provider === 'cosmosdb' && (!config.endpoint || !config.key)) {
            if (process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY) {
                console.log(`[query-by-id] Injecting system Cosmos DB credentials`);
                config.endpoint = process.env.COSMOS_ENDPOINT;
                config.key = process.env.COSMOS_KEY;
                if (!config.database) config.database = process.env.COSMOS_DATABASE || 'PegasusLive';
                if (!config.container) config.container = process.env.COSMOS_CONTAINER || 'OrionMetrics';
            }
        }

        const adapter = await createAdapter(provider, config, userId)
        if (!adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }
        let result = null
        let error = null

        try {
            await adapter.connect()
            result = await adapter.query(query)
        } catch (err) {
            console.error(`[query-by-id] Adapter error:`, err);
            error = err.message || String(err)
        } finally {
            await adapter.disconnect()
        }

        if (error) {
            return c.json({ error: `Query execution failed: ${error}`, ok: false }, 500)
        }

        return c.json({ ok: true, result })
    } catch (e) {
        console.error('[query-by-id] Fatal Route Error:', e)
        return c.json({ error: `Internal Server Error: ${e.message || 'Unknown error'}` }, 500)
    }
})



const schemaCache = new Map();
const SCHEMA_TTL = 300000; // 5 minutes

app.post("/schema", async (c) => {
    try {
        const body = await c.req.json()
        let { provider, connection } = body

        // Cache Key: provider + connection string (simple hash)
        const cacheKey = `${provider}:${JSON.stringify(connection)}`;
        const cached = schemaCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < SCHEMA_TTL)) {
            console.log(`[/schema] Returning cached schema for ${provider}`);
            return c.json(cached.data);
        }

        if (provider === 'file') provider = 'duckdb'
        if (provider === 'surrealdb') provider = 'postgres'

        // Extract userId from JWT token
        const token = getAuthToken(c)
        let userId = null
        if (token) {
            try {
                const payload = await verify(token, jwtSecret)
                userId = payload.sub
            } catch (e) {
                console.warn('[/schema] Invalid token, continuing without userId')
            }
        }

        // Force Read Only for schema fetching (prevents locking)
        const readOnlyConn = { ...connection, readOnly: true }
        const adapter = await createAdapter(provider, readOnlyConn, userId)

        if (!adapter) {
            return c.json({ error: `Provider '${provider}' not supported` }, 400)
        }

        try {
            await adapter.connect()
            const tables = await adapter.listCollections()
            console.log(`[/schema] ${provider} returned ${tables.length} tables for database ${connection.database ?? 'unknown'}`)

            // For SurrealDB and DuckDB, fetch display names from uploads metadata
            let tableDisplayNames = {}
            const tableMetadata = {}

            if (provider === 'postgres' || provider === 'duckdb') {
                const isDuckDB = provider === 'duckdb'

                // Find the space_file entry to get original sheet names
                let uploadFile = null
                if (isDuckDB && connection.path) {
                    uploadFile = await db.query.spaceFiles.findFirst({
                        where: eq(spaceFiles.storagePath, connection.path)
                    })
                }

                for (const tableName of tables) {
                    // 1. Try SurrealDB style (data_[uuid]_[name])
                    const uuidMatch = tableName.match(/^data_([a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/i)

                    if (uuidMatch) {
                        const uuid = uuidMatch[1]
                        try {
                            const sf = await db.query.spaceFiles.findFirst({
                                where: eq(spaceFiles.id, uuid.length > 8 ? uuid : undefined) // Only if full UUID
                            });
                            if (sf?.filename) {
                                tableDisplayNames[tableName] = sf.filename
                                tableMetadata[tableName] = { displayName: sf.filename, actualName: tableName }
                            }
                        } catch (e) { }
                    }

                    // 2. Try DuckDB style mapping from parsedSchema
                    if (isDuckDB && uploadFile && uploadFile.parsedSchema) {
                        const schema = uploadFile.parsedSchema
                        // If it's a single table (CSV), use filename
                        if (tables.length === 1) {
                            tableDisplayNames[tableName] = uploadFile.filename
                            tableMetadata[tableName] = { displayName: uploadFile.filename, actualName: tableName }
                        } else {
                            // If Excel, we might need to match the sanitized name back to the sheet name
                            // This is tricky if we don't store the explicit mapping.
                            // But usually the sanitized name contains the sheet name at the end.
                            const parts = tableName.split('_')
                            const lastPart = parts[parts.length - 1]
                            tableDisplayNames[tableName] = lastPart
                            tableMetadata[tableName] = { displayName: lastPart, actualName: tableName }
                        }
                    }
                }
            }

            // Clean up table names for display
            const cleanTableName = (tableName) => {
                if (provider === 'surrealdb' && tableDisplayNames[tableName]) {
                    return tableDisplayNames[tableName]
                }
                if (provider === 'surrealdb' && tableName.startsWith('data_')) {
                    // Fallback: extract from table name
                    const match = tableName.match(/^data_([a-f0-9]{32}|[a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_(.+)$/i)
                    if (match) {
                        return match[2] // Group 2 is the name part
                    }
                }
                return tableName
            }

            // If no specific database was provided, infer discovered databases from returned table names
            let databases = []
            if (!connection || !connection.database) {
                const dbSet = new Set()
                for (const t of tables) {
                    if (typeof t === 'string' && t.includes('.')) {
                        const [dbName] = t.split('.', 1)
                        if (dbName) dbSet.add(dbName)
                    }
                }
                databases = Array.from(dbSet)
            } else {
                databases = [connection.database]
            }

            // In shallow mode, we skip previews to save time and bandwidth
            const previews = []

            // Create metadata map for display names (if not already found)
            tables.forEach(t => {
                if (!tableMetadata[t]) {
                    tableMetadata[t] = {
                        displayName: cleanTableName(t),
                        actualName: t
                    }
                }
            })

            // Convert BigInt values to regular numbers for JSON serialization
            const sanitizeBigInt = (obj) => {
                if (obj === null || obj === undefined) return obj;
                if (typeof obj === 'bigint') return Number(obj);
                if (Array.isArray(obj)) return obj.map(sanitizeBigInt);
                if (typeof obj === 'object') {
                    const result = {};
                    for (const key in obj) {
                        result[key] = sanitizeBigInt(obj[key]);
                    }
                    return result;
                }
                return obj;
            };

            const sanitizedPreviews = sanitizeBigInt(previews);

            const responseData = {
                ok: true,
                tables,  // Keep as array of strings for backward compatibility
                tableMetadata,  // Add metadata separately
                previews: sanitizedPreviews,
                databases
            };

            // Store in cache
            schemaCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

            return c.json(responseData)
        } catch (err) {
            // Return a more structured error so the UI can show friendlier messages.
            const code = (err && (err.code || err.name)) || 'UNKNOWN_ERROR'
            const message = err && err.message ? err.message : 'An unknown error occurred while probing the schema'
            console.warn('[/schema] Schema discovery failed:', { message, code });
            return c.json({ error: message, code }, 400)
        } finally {
            if (adapter) await adapter.disconnect()
        }
    } catch (err) {
        console.error('[/schema] Fatal handler error:', err);
        return c.json({ error: err.message }, 500);
    }
})

app.post("/schema/details", async (c) => {
    try {
        const body = await c.req.json()
        let { provider, connection, table } = body
        if (!table) return c.json({ error: "Table name required" }, 400)

        // Extract userId from JWT token
        const token = getAuthToken(c)
        let userId = null
        if (token) {
            try {
                const payload = await verify(token, jwtSecret)
                userId = payload.sub
            } catch (e) { }
        }

        const adapter = await createAdapter(provider, { ...connection, readOnly: true }, userId)
        if (!adapter) return c.json({ error: `Provider '${provider}' not supported` }, 400)

        try {
            await adapter.connect()
            const rows = await adapter.sampleCollection(table, 10)

            // Try to get column types if adapter supports it
            let columns = []
            try {
                // Some adapters might have a dedicated method, or we infer from rows
                if (rows.length > 0) {
                    columns = Object.keys(rows[0]).map(key => ({
                        name: key,
                        type: typeof rows[0][key]
                    }))
                }
            } catch (e) { }

            return c.json({
                ok: true,
                table,
                rows,
                columns
            })
        } catch (err) {
            return c.json({ error: err.message }, 500)
        } finally {
            await adapter.disconnect()
        }
    } catch (err) {
        return c.json({ error: err.message }, 500)
    }
})

// AI Routes moved to src/routes/chat.js

// Queries Routes
// Queries Routes
app.get("/queries", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        const spaceId = c.req.query("space_id")

        // Only fetch queries with 'user' source - these are actual SQL queries
        // AI usage logs (ai_generation, ai_spreadsheet, etc.) contain natural language prompts
        // and should not be shown in the Queries tab
        const conditions = [
            eq(queryHistory.userId, userId),
            eq(queryHistory.source, 'user')
        ]

        if (spaceId) {
            conditions.push(eq(queryHistory.spaceId, spaceId))
        } else {
            // If no spaceId provided (legacy), verify behavior. 
            // Ideally we only show global or personal space queries if we had that distinction clearly mapped.
            // For now, if no spaceId is passed, we might show all, BUT logical correctness implies we should filtering by space if the UI sends it.
            // If the UI sends space_id, we filter. If not, we return all (legacy behavior).
        }

        const results = await db.select()
            .from(queryHistory)
            .where(and(...conditions))
            .orderBy(desc(queryHistory.createdAt))
            .limit(50);

        const mapped = results.map(q => ({
            id: q.id,
            query: q.query,
            timestamp: q.createdAt.getTime(),
            source: q.source,
            model: q.model,
            status: q.status,
            connection_id: q.connectionId,
            space_id: q.spaceId
        }))

        return c.json(mapped)
    } catch (e) {
        console.error("Fetch queries error:", e)
        return c.json({ error: "Failed to fetch queries" }, 500)
    }
})

app.post("/queries", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub
        await upsertUser(payload)
        const { query, source, status, connection_id, model, tokens_used, space_id } = await c.req.json()

        // Create record
        const [created] = await db.insert(queryHistory).values({
            userId,
            query,
            source: source || 'user',
            model: model || null,
            status: status || 'success',
            connectionId: connection_id || null,
            tokensUsed: tokens_used || 0,
            spaceId: space_id || null
        }).returning();

        return c.json({ id: created.id })
    } catch (e) {
        console.error("Save query error:", e)
        return c.json({ error: "Failed to save query" }, 500)
    }
})

app.delete("/queries/:id", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { id } = c.req.param()

        // User can only delete their own queries
        await db.delete(queryHistory).where(and(eq(queryHistory.id, id), eq(queryHistory.userId, payload.sub)));

        return c.json({ success: true })
    } catch (e) {
        console.error("Delete query error:", e)
        return c.json({ error: "Failed to delete query" }, 500)
    }
})

app.delete("/queries", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)

        // Delete all queries for this user
        await db.delete(queryHistory).where(eq(queryHistory.userId, payload.sub));

        return c.json({ success: true })
    } catch (e) {
        console.error("Clear queries error:", e)
        return c.json({ error: "Failed to clear queries" }, 500)
    }
})

// Feedback endpoint
app.post("/feedback", async (c) => {
    try {
        const { createFeedback } = await import("./src/services/feedback.js")
        const { sendCriticalFeedbackEmail } = await import("./src/services/email.js")

        const body = await c.req.json()
        const feedbackData = {
            userEmail: body.userEmail,
            featureCategory: body.featureCategory,
            customFeature: body.customFeature,
            issueType: body.issueType,
            description: body.description,
            browserInfo: body.browserInfo,
            isUrgent: body.isUrgent || false
        }

        // Validate required fields
        if (!feedbackData.featureCategory || !feedbackData.issueType || !feedbackData.description) {
            return c.json({ error: "Missing required fields" }, 400)
        }

        const { feedback, priority } = await createFeedback(feedbackData)

        // Send immediate email for critical feedback
        if (priority === "critical") {
            await sendCriticalFeedbackEmail(feedback)
        }

        return c.json({
            success: true,
            message: "Feedback submitted successfully",
            priority
        })
    } catch (e) {
        console.error("Error submitting feedback:", e)
        return c.json({ error: "Failed to submit feedback" }, 500)
    }
})



app.get("/usage", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const userId = payload.sub

        // DEV MODE BYPASS
        if (process.env.PEGASUS_DEV_MODE === 'true' && userId === 'dev_user') {
            const mockUsage = {
                tokens: 5000,
                limit: 1000000,
                tier: 'pro_plus',
                purchasedTokens: 0,
                purchasedStorage: 0,
                storage: 1024 * 1024 * 100, // 100MB
                storageLimit: 1024 * 1024 * 1024 * 10,
                storageFormatted: '100 MB',
                storageLimitFormatted: '10 GB',
                tierUsage: {
                    connections: { current: 1, limit: 100 },
                    tables: { current: 5, limit: 1000 },
                    dashboards: { current: 1, limit: 50 }
                }
            }
            return c.json(mockUsage)
        }


        const {
            tier,
            tokenLimit: limit,
            storageLimit,
            purchasedTokens,
            purchasedStorage
        } = await calculateUserLimits(db, userId);

        // Calculate start of current month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        // Get total tokens used THIS MONTH
        const result = await db.select({ total: sql`sum(${queryHistory.tokensUsed})` })
            .from(queryHistory)
            .where(and(
                eq(queryHistory.userId, userId),
                gte(queryHistory.createdAt, startOfMonth)
            ));
        const tokenResult = result[0]?.total || 0;
        const totalTokens = Number(tokenResult);

        // Get storage used (approximate size of uploaded DBs)
        // Get storage used
        const connResult = await db.select({ config: connections.config })
            .from(connections)
            .where(and(eq(connections.userId, userId), eq(connections.type, 'sqlite')));

        let totalStorage = 0

        // 1. Local SQLite storage (legacy)
        for (const row of connResult) {
            try {
                const config = JSON.parse(row.config)
                const sqliteConfig = config.sqlite

                if (sqliteConfig && sqliteConfig.path && sqliteConfig.path.startsWith('file:')) {
                    const filePath = sqliteConfig.path.replace('file:', '')
                    try {
                        if (filePath.includes('/uploads/')) {
                            try {
                                const stats = await fs.stat(filePath)
                                totalStorage += stats.size
                            } catch (e) {
                                if (typeof Bun !== 'undefined') {
                                    const file = Bun.file(filePath)
                                    totalStorage += await file.size()
                                }
                            }
                        }
                    } catch (e) { }
                }
            } catch (e) { }
        }

        // 2. Cloud Storage from 'files' table
        const [fileResult] = await db.select({ total: sql`sum(${files.size})` })
            .from(files)
            .where(eq(files.userId, userId));
        totalStorage += Number(fileResult?.total || 0);

        // 3. Cloud Storage from 'spaceFiles' table

        const [spaceFileSum] = await db.select({ total: sql`sum(${spaceFiles.fileSizeBytes})` })
            .from(spaceFiles)
            .innerJoin(dataSpaces, eq(spaceFiles.spaceId, dataSpaces.id))
            .where(eq(dataSpaces.userId, userId));

        totalStorage += Number(spaceFileSum?.total || 0);


        // Get tier-based usage summary
        const tierUsage = await getUserUsageSummary(db, userId, tier)

        // Add tokens and storage to tierUsage for frontend compatibility
        tierUsage.tokens = {
            current: totalTokens,
            limit: limit,
            purchased: purchasedTokens,
            percentage: limit > 0 ? Math.round((totalTokens / limit) * 100) : 0
        }

        tierUsage.storage = {
            current: totalStorage,
            limit: storageLimit,
            purchased: purchasedStorage,
            currentFormatted: (totalStorage / (1024 * 1024)).toFixed(2) + ' MB',
            limitFormatted: (storageLimit / (1024 * 1024)).toFixed(2) + ' MB',
            percentage: storageLimit > 0 ? Math.round((totalStorage / storageLimit) * 100) : 0
        }

        return c.json({
            tokens: totalTokens,
            limit: limit,
            tier: tier,
            purchasedTokens: purchasedTokens,
            purchasedStorage: purchasedStorage,
            storage: totalStorage, // in bytes
            storageLimit: storageLimit,
            storageFormatted: (totalStorage / (1024 * 1024)).toFixed(2) + ' MB',
            storageLimitFormatted: (storageLimit / (1024 * 1024)).toFixed(2) + ' MB',
            tierUsage // Add tier-specific usage (connections, tables, dashboards, tokens, storage)
        })
    } catch (e) {
        console.error("Fetch usage error:", e)
        return c.json({ error: "Failed to fetch usage stats" }, 500)
    }
})

// initialization block
const isBun = typeof Bun !== 'undefined';
// startServer logic moved to the bottom of the file to ensure instant port binding on Railway.

// Helper to create table and insert data (refactored to avoid duplication)
async function createTableAndInsertData(tableName, rows) {
    if (!rows || rows.length === 0) return;

    const columnNames = new Set();
    rows.forEach(row => Object.keys(row).forEach(key => columnNames.add(key)));

    // In Postgres, we'll create a table dynamically for user-uploaded data
    // We'll use JSONB for simplicity since we don't know the schema ahead of time, 
    // or we can try to guess types. For now, let's create a table with a 'data' jsonb column
    // or dynamic columns.

    const columnsSql = Array.from(columnNames).map(col => `"${col}" TEXT`).join(', ');

    try {
        await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "${tableName}" (
      id SERIAL PRIMARY KEY,
      _row_order INTEGER,
      ${columnsSql}
    )`));
        console.log(`[DB] Created dynamic table: ${tableName}`);
    } catch (e) {
        console.warn(`[DB] Table ${tableName} create warning:`, e.message);
    }

    // Batch Insert
    const chunkSize = 50;
    const allKeys = Array.from(columnNames);
    const keysStr = allKeys.map(k => `"${k}"`).join(', ');

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        if (!chunk.length) continue;

        try {
            // Try Batch Insert
            const valuesChunks = [];
            for (let j = 0; j < chunk.length; j++) {
                const row = chunk[j];
                const rowParams = [];
                // _row_order
                rowParams.push(i + j);
                allKeys.forEach(k => {
                    rowParams.push(row[k] !== undefined ? row[k] : null);
                });

                const rowSql = sql`(${rowParams[0]}`;
                for (let p = 1; p < rowParams.length; p++) {
                    rowSql.append(sql`, ${rowParams[p]}`);
                }
                rowSql.append(sql`)`);
                valuesChunks.push(rowSql);
            }

            if (valuesChunks.length > 0) {
                const finalQuery = sql.raw(`INSERT INTO "${tableName}" (_row_order, ${keysStr}) VALUES `);
                finalQuery.append(valuesChunks[0]);
                for (let k = 1; k < valuesChunks.length; k++) {
                    finalQuery.append(sql`, `);
                    finalQuery.append(valuesChunks[k]);
                }
                await db.execute(finalQuery);
            }

        } catch (batchError) {
            console.warn(`[DB] Batch insert failed for chunk ${i}, falling back to row-by-row. Error:`, batchError.message);

            // Fallback: Row-by-Row
            for (const row of chunk) {
                const keys = Object.keys(row);
                const values = keys.map(k => row[k]);
                const rowKeysStr = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, idx) => `$${idx + 2}`).join(', ');
                try {
                    await db.execute(sql.raw(`
                  INSERT INTO "${tableName}" (_row_order, ${rowKeysStr})
                  VALUES ($1, ${placeholders})
                `), [i + chunk.indexOf(row), ...values]);
                } catch (e) {
                    console.error(`[DB] Single row insert failed:`, e.message);
                }
            }
        }
    }
}

// Export for platforms
// On Vercel, we need the handler as default export
// On Bun, we export a dummy object to prevent Bun from auto-starting its own server
const defaultExport = isVercel ? handle(app) : (isBun ? { name: "pegasus-backend" } : app);
export default defaultExport;
export { app };

// 1. Core Server Start
if (!isVercel) {
    const numericPort = Number(port);
    console.log(`[Railway] Booting instantly on 0.0.0.0:${numericPort}...`);

    // Basic health check registered BEFORE imports to be safe
    app.get('/health', (c) => c.text('PEGASUS_OK'));

    const serverInstance = serve({
        fetch: app.fetch.bind(app),
        port: numericPort,
        hostname: '0.0.0.0'
    }, (info) => {
        console.log(`🚀 [Main] Server listening on ${info.address}:${info.port} (Family: ${info.family})`);

        // Ensure app.fetch is indeed the one being used
        if (typeof app.fetch !== 'function') {
            console.error('❌ [Main] CRITICAL ERROR: app.fetch is not a function! Hono is misconfigured.');
        }

        // 2. Load routes and backend services only AFTER the port is bound
        (async () => {
            const startInit = Date.now();
            console.log("[Main] Starting full initialization...");
            try {
                // Initialize Socket.io
                initSocketServer(serverInstance, allowedOrigins);
                console.log("[Main] Socket.io initialized");

                // Background Jobs
                startAllJobs();
                console.log("[Main] Background jobs scheduled");

                // Start Server-dependent services
                try {
                    startPollingService();
                    console.log("[Main] Polling service started");
                } catch (e) { console.error("[Main] Polling error:", e.message); }

                // Database connectivity check
                try {
                    await db.select({ val: sql`1` });
                    console.log('[Main] Database (Neon) active');
                } catch (e) {
                    console.error('[Main] Warning: Database connectivity check failed:', e.message);
                }

                // DEV MODE: Setup test user
                if (process.env.PEGASUS_DEV_MODE === 'true') {
                    console.log('🛠️  [DEV_MODE] Setting up dev user...');
                    try {
                        await db.insert(users).values({
                            id: 'dev_user',
                            email: 'dev@pegasus.ai',
                            firstName: 'Developer', subscriptionTier: 'pro_plus', updatedAt: new Date()
                        }).onConflictDoUpdate({ target: users.id, set: { updatedAt: new Date() } });
                    } catch (e) { console.error('🛠️  [DEV_MODE] Setup failed:', e.message); }
                }

                console.log(`✅ [Main] Full initialization complete (${Date.now() - startInit}ms)`);
            } catch (err) {
                console.error("❌ [Main] Initialization error:", err);
            }
        })();
    });
}
