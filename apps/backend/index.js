import { Hono } from "hono"
import { cors } from "hono/cors"
import { adapters } from "./adapters/index.js"
import { serve } from '@hono/node-server'
import { handle } from '@hono/node-server/vercel'
import { compress } from 'hono/compress'
import { etag } from 'hono/etag'
import { initSocketServer } from "./src/socket.js"
import { ConfigService } from "./src/services/ConfigService.js"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"
import { db, connectDB, ensureConnection } from "./db/surreal.js"
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
import { dataSourceRoutes } from "./src/routes/data-sources.js"
import { startPollingService } from "./src/services/polling-service.js"
import { aiClient } from "./ai/AIClient.js"
import { initializeWeeklyDigest } from "./src/jobs/weeklyDigest.js"
import { parseExcel } from "./lib/excelParser.js"
import { parseXML, flattenXML } from "./lib/xmlParser.js"
import { authRoutes } from "./src/routes/auth.js"
import { getAuthToken } from "./lib/auth.js"
import { getPayments } from "./src/routes/payments.js"
import adminFixTier from "./src/routes/admin-fix-tier.js"
import { analyzeForSanitization, applySanitization } from "./ai/sanitizer.js"
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
import { getUserUsageSummary, calculateUserLimits } from "./lib/tierLimits.js"
import Stripe from "stripe"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

console.log(`[Backend] Booting Pegasus at ${new Date().toISOString()}`);

const port = process.env.PORT || 3000;
const jwtSecret = ConfigService.getJwtSecret();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

const frontendUrl = ConfigService.getFrontendUrl();
const isProd = ConfigService.isProduction();

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
  "https://pegasus-ui-chi.vercel.app",
  frontendUrl
].filter(Boolean);

const app = new Hono()

// Refined CORS configuration
const corsConfig = {
  origin: (origin) => {
    if (!origin) return allowedOrigins[0];

    // 1. Explicit whitelist
    if (allowedOrigins.includes(origin)) return origin;

    // 2. Extra safety for exact production deployment
    if (origin === "https://pegasus-ui-chi.vercel.app") return origin;

    // 3. Pegasus Vercel deployments (regex for better coverage)
    if (origin.endsWith('.vercel.app') && (origin.includes('pegasus') || origin.includes('tfq26'))) return origin;

    // 3. Local development
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    if (!isProd && (origin.includes('localhost') || origin.includes('127.0.0.1'))) return origin;

    return null;
  },
  methods: ["GET", "POST", "OPTIONS", "DELETE", "PUT"],
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With", "Accept", "Origin"],
  exposeHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
  maxAge: 86400
};

// Apply CORS globally
app.use("*", cors(corsConfig))

// Request Logger
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  // Skip high-frequency polling logs to keep console clean
  const isPolling = c.req.url.includes('/status') || c.req.url.includes('/usage') || c.req.url.includes('/subscription-status');
  if (isPolling && (c.res.status === 200 || c.res.status === 304)) return;

  console.log(`[${c.req.method}] ${c.req.url} - ${c.res.status} (${ms}ms)`);
});

if (typeof CompressionStream !== 'undefined') {
  app.use('*', compress())
}
app.use('*', etag())

// Ensure database connection on Vercel (serverless environment)
// On Vercel, startServer() is NOT called, so we need to connect on first request
const isVercel = process.env.VERCEL === '1';
if (isVercel) {
  app.use('*', async (c, next) => {
    try {
      await ensureConnection(); // This handles token refresh automatically
    } catch (e) {
      console.error('[Vercel] Database connection failed:', e.message);
      // Don't block the request, let it proceed (some endpoints don't need DB)
    }
    return next();
  });
}

// Global Error Handlers
app.notFound((c) => {
  const origin = c.req.header('origin')
  if (origin && (allowedOrigins.includes(origin) || (origin.endsWith('.vercel.app') && origin.includes('pegasus')))) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
  }
  return c.text('404 Not Found', 404)
})

app.onError((err, c) => {
  console.error('[Global Error]', err)

  // Ensure CORS headers are present even on errors
  const origin = c.req.header('origin')
  if (origin && (allowedOrigins.includes(origin) || (origin.endsWith('.vercel.app') && origin.includes('pegasus')))) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Credentials', 'true')
  }

  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  }, 500)
})

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
    if (!status.hasAccess) return c.json({ error: "No experimental access" }, 403)
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
app.route('/admin-fix', adminFixTier) // Temporary admin endpoint for fixing subscription tiers
app.route('/', dashboardRoutes)
app.route('/connections', connectionRoutes)
app.route('/experimental', experimental) // Mount as /experimental/features
app.route('/api/experimental', experimental) // Also mount as /api/experimental/features for backward compatibility
app.route('/api', tableRoutes)
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
app.get('/payments', getPayments)

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
  try {
    const userId = payload.sub || payload.id
    const userRecordId = `user:${userId}`

    // 1. Try to find by ID
    const [existingById] = await db.query(`SELECT id FROM ${userRecordId}`);

    if (existingById && existingById.length > 0) {
      // Found by ID -> Update
      await db.query(`
                UPDATE ${userRecordId} SET 
                    email = $email,
                    first_name = $firstName,
                    last_name = $lastName,
                    profile_picture_url = $pic,
                    updated_at = time::now();
            `, {
        email: payload.email,
        firstName: payload.firstName || payload.first_name,
        lastName: payload.lastName || payload.last_name,
        pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
      });
      return existingById[0].id.toString();
    } else {
      // 2. Not found by ID -> Check by Email to prevent duplicates
      const [existingByEmail] = await db.query(`SELECT id FROM user WHERE email = $email`, { email: payload.email });

      if (existingByEmail && existingByEmail.length > 0) {
        // Found by Email -> Update that record instead
        const targetId = existingByEmail[0].id.toString();
        await db.query(`
                    UPDATE ${targetId} SET 
                        first_name = $firstName,
                        last_name = $lastName,
                        profile_picture_url = $pic,
                        updated_at = time::now();
                `, {
          firstName: payload.firstName || payload.first_name,
          lastName: payload.lastName || payload.last_name,
          pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
        });
        return targetId;
      } else {
        // 3. Not found by ID or Email -> Create new
        await db.query(`
                    CREATE ${userRecordId} CONTENT {
                        email: $email,
                        first_name: $firstName,
                        last_name = $lastName,
                        profile_picture_url = $pic,
                        created_at: time::now(),
                        updated_at: time::now()
                    };
                `, {
          email: payload.email,
          firstName: payload.firstName || payload.first_name,
          lastName: payload.lastName || payload.last_name,
          pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
        });
        return userRecordId;
      }
    }
  } catch (e) {
    console.error("[DB] Failed to upsert user:", e)
    return null;
  }
}

// Auth Routes moved to consolidated mount section above


// File Upload Endpoint
// Migrated from Turso to SurrealDB
// We will store uploaded data in SurrealDB tables.
// Metadata in `uploads` table, data in `data_{uploadId}_{tableName}` tables.

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

    console.log(`[Upload] Received upload request. File: ${file?.name || 'none'}, ConnectionId: ${connectionId || 'new connection'}`)

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400)
    }

    const fileName = file.name
    const fileSize = file.size
    const fileType = fileName.split('.').pop().toLowerCase()

    // Check if we're adding to an existing connection
    let uploadUuid
    let uploadId
    let existingUpload = null

    if (connectionId) {
      // Fetch the existing connection to get its upload ID
      const connIdPart = connectionId.includes(':') ? connectionId.split(':')[1] : connectionId
      const [connections] = await db.query(
        `SELECT * FROM connection WHERE id = type::thing('connection', $id)`,
        { id: connIdPart }
      )
      const connection = connections?.[0]

      console.log(`[Upload] Looking up connection ${connectionId}:`, connection ? 'found' : 'not found')

      if (connection) {
        // Parse the config (may be string or object)
        let config = connection.config
        if (typeof config === 'string') {
          try { config = JSON.parse(config) } catch (e) { config = {} }
        }

        // Check for uploadId in surrealdb config
        const uploadIdFromConfig = config?.surrealdb?.uploadId

        if (uploadIdFromConfig) {
          // Extract the UUID from the existing upload ID (format: "uploads:uuid")
          uploadUuid = uploadIdFromConfig.replace('uploads:', '')
          uploadId = uploadIdFromConfig
          existingUpload = connection
          console.log(`[Upload] Adding table to existing connection ${connectionId}, uploadId: ${uploadId}`)
        } else {
          console.log(`[Upload] Connection found but no uploadId. Config:`, config)
          return c.json({ error: "Connection not found or not a file-based connection" }, 400)
        }
      } else {
        return c.json({ error: "Connection not found" }, 400)
      }
    } else {
      // Create new upload ID
      uploadUuid = crypto.randomUUID().replace(/-/g, '')
      uploadId = `uploads:${uploadUuid}`
    }

    const uploadDir = path.join(os.tmpdir(), "uploads")
    const tempFilePath = path.join(uploadDir, `${uploadUuid}_${fileName}`)

    // Ensure uploads dir exists
    await fs.mkdir(uploadDir, { recursive: true })

    // Save uploaded file temporarily
    await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

    let data = {}
    let excelMapping = null; // Store AI interpretation for later use

    try {
      if (fileType === 'xlsx') {
        // Use XML-based AI interpretation for robust Excel parsing
        console.log('[Upload] Using XML-based AI Excel interpretation...');
        try {
          const { interpretExcelFromXML } = await import('./ai/xmlExcelInterpreter.js');
          const xmlResult = await interpretExcelFromXML(tempFilePath);

          if (xmlResult && xmlResult.data && xmlResult.data.length > 0) {
            console.log(`[Upload] XML AI interpretation successful: ${xmlResult.data.length} rows`);
            // Get sheet name from original parser or use default
            const parseResult = await parseExcel(tempFilePath);
            const sheetName = Object.keys(parseResult.sheets)[0] || 'Sheet1';
            data = { [sheetName]: xmlResult.data };
            excelMapping = xmlResult.mapping;
          } else {
            // Fallback to original parser if XML interpretation fails
            console.warn('[Upload] XML interpretation returned no data, using original parser');
            const parseResult = await parseExcel(tempFilePath);
            data = parseResult.sheets;
            console.log(`[Upload] Fallback parser returned ${Object.keys(data).length} sheets:`, Object.keys(data));
            Object.entries(data).forEach(([sheet, rows]) => {
              console.log(`[Upload] Sheet "${sheet}": ${rows?.length || 0} rows`);
            });
            // Log confidence scores
            Object.entries(parseResult.metadata || {}).forEach(([sheet, meta]) => {
              console.log(`[Upload] Sheet "${sheet}" confidence: ${meta.confidence?.toFixed(2) || 'N/A'} (${meta.method || 'unknown'})`);
              if (meta.warnings) console.warn(`[Upload] Warnings:`, meta.warnings);
            });
          }
        } catch (xmlError) {
          console.error('[Upload] XML interpretation error:', xmlError.message);
          console.warn('[Upload] Falling back to original parser');
          const parseResult = await parseExcel(tempFilePath);
          data = parseResult.sheets;
          // Log confidence scores
          Object.entries(parseResult.metadata).forEach(([sheet, meta]) => {
            console.log(`[Upload] Sheet "${sheet}" confidence: ${meta.confidence.toFixed(2)} (${meta.method})`);
            if (meta.warnings) console.warn(`[Upload] Warnings:`, meta.warnings);
          });
        }
      } else if (fileType === 'xml') {
        const xmlContent = await fs.readFile(tempFilePath, 'utf-8')
        const parsed = parseXML(xmlContent)
        const flat = flattenXML(parsed)
        if (flat.length > 0) {
          data = { "Data": flat }
        } else {
          data = { "Data": [parsed] }
        }
      } else if (fileType === 'json') {
        const jsonContent = await fs.readFile(tempFilePath, 'utf-8')
        const parsed = JSON.parse(jsonContent)
        if (Array.isArray(parsed)) {
          data = { "Data": parsed }
        } else {
          data = { "Data": [parsed] }
        }
      } else {
        throw new Error("Unsupported file type")
      }
    } finally {
      // Delete the original uploaded file
      await fs.unlink(tempFilePath).catch(e => console.error("Failed to delete temp file:", e))
    }


    // 1. Insert Metadata into Uploads DB (SurrealDB) - only for NEW uploads
    // We explicitly define `id` to ensure we can reference it easily
    // We store the RAW file content as base64 to keep it in the single DB.
    if (!existingUpload) {
      const fileBuffer = await file.arrayBuffer();
      const base64Content = Buffer.from(fileBuffer).toString('base64');

      await db.create(uploadId, {
        user_id: userId ? `user:${userId}` : null,
        filename: fileName,
        size: fileSize,
        format: fileType,
        visibility: 'private',
        created_at: new Date(),
        file_data: base64Content, // Store raw file
        excel_mapping: excelMapping // Store AI interpretation if available
      });
    } else {
      console.log(`[Upload] Skipping metadata creation - adding to existing upload ${uploadId}`)
    }

    // 2. Create tables and insert data into SurrealDB
    const createdTables = [];
    for (const [rawTableName, rows] of Object.entries(data)) {
      if (!rows || rows.length === 0) continue

      // Sanitize table name for SurrealDB
      const safeTableName = rawTableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      // Base ID: uploads:uuid_tablename
      const baseTableId = `data_${uploadUuid}_${safeTableName}`;

      // --- A. Create ORIGINAL Table ---
      console.log(`[Upload] Creating original table: ${baseTableId}`);
      await createTableAndInsertData(baseTableId, rows);

      // --- B. Auto-Sanitize ---


      createdTables.push(baseTableId);
    }

    // --- C. Auto-Index for RAG (Experimental) ---
    if (userId) {
      try {
        const enabledFeatures = await getUserFeatureFlags(db, userId);
        if (enabledFeatures.includes('rag-pipeline')) {
          console.log(`[RAG] Auto-indexing ${createdTables.length} tables for user ${userId}...`);
          // Background task
          (async () => {
            for (const [rawTableName, rows] of Object.entries(data)) {
              if (!rows || rows.length === 0) continue;
              const safeTableName = rawTableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
              const sourceId = `upload_${uploadUuid}_${safeTableName}`;
              await RAGService.indexTableData(rows, rawTableName, sourceId, userId);
            }
          })().catch(err => console.error('[RAG] Auto-indexing failed:', err));
        }
      } catch (err) {
        console.error('[RAG] Auto-indexing feature check failed:', err);
      }
    }

    return c.json({
      success: true,
      provider: 'surrealdb',
      uploadId: uploadId, // Return the full ID "uploads:uuid" or just "uuid" if consistent
      tables: createdTables
    })

  } catch (e) {
    console.error("Upload failed:", e)
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
    const [user] = await db.query(`SELECT subscription_tier, stripe_customer_id FROM type::thing('user', $rawId)`, { rawId: payload.sub });
    const userRecord = user[0];
    const tier = userRecord?.subscription_tier || 'free';

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
    const [user] = await db.query(`SELECT subscription_tier, stripe_customer_id FROM type::thing('user', $rawId)`, { rawId: payload.sub });
    const tier = user[0]?.subscription_tier || 'free'
    let customerId = user[0]?.stripe_customer_id;

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
    const [user] = await db.query(`SELECT stripe_customer_id FROM user:${payload.sub}`);
    const customerId = user[0]?.stripe_customer_id

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



    // Get user's subscription tier from database
    const [user] = await db.query(`SELECT subscription_tier, stripe_customer_id, email FROM user:${userId}`);


    let tier = user[0]?.subscription_tier || 'free'
    let stripeCustomerId = user[0]?.stripe_customer_id
    const email = user[0]?.email

    // Fallback: If no customer ID in DB, try to find by email
    if (!stripeCustomerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 })
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id
        // Save it for next time
        await db.query(`UPDATE user:${userId} SET stripe_customer_id = $cid`, { cid: stripeCustomerId })
      }
    }

    // Auto-fix: If tier is 'free', check payment history for subscription payments
    if (tier === 'free') {
      const rawId = userId.replace('user:', '')


      const [payments] = await db.query(`
        SELECT * FROM user_payment 
        WHERE user = type::thing('user', $rawId)
        AND string::lowercase(description) CONTAINS 'subscription'
        ORDER BY created_at DESC
        LIMIT 1
      `, { rawId });




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
          await db.query(`
            UPDATE user:${userId} SET 
              subscription_tier = $tier,
              stripe_customer_id = $customerId
          `, { tier, customerId: customerIdToUpdate || '' });


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
      const [users] = await db.query(`SELECT id, email FROM user WHERE stripe_customer_id = $cid`, { cid: customerId });

      if (users && users.length > 0) {
        const user = users[0];
        const tier = subscription.plan?.nickname?.toLowerCase().includes('pro+') ? 'pro_plus' : 'pro'; // Simple heuristic

        await db.query(`
          UPDATE ${user.id} SET 
            subscription_tier = $tier,
            subscription_status = $status,
            subscription_renews_at = $renewsAt,
            updated_at = time::now()
        `, {
          tier: status === 'active' ? tier : 'free',
          status,
          renewsAt: new Date(currentPeriodEnd * 1000).toISOString()
        });

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
    await db.query(`
      UPDATE user SET 
        stripe_customer_id = $custId,
        subscription_tier = $tier
      WHERE email = $email;
    `, {
      custId: customer.id,
      tier,
      email
    })

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
    await db.query(`UPDATE type::thing('user', $rawId) SET stripe_customer_id = $cid`, { rawId, cid: customer.id })

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
      const [existing] = await db.query(`SELECT id FROM user_payment WHERE stripe_session_id = $sid`, { sid })

      if (!existing || existing.length === 0) {

        const metadata = session.metadata || {}
        const tokenAmount = parseInt(metadata.token_amount || '0')
        const isToken = metadata.type === 'token_purchase'
        const storageGb = parseInt(metadata.storage_gb || '0')
        const isStorage = metadata.type === 'storage_purchase'

        await db.query(`
          INSERT INTO user_payment {
            user: type::thing('user', $rawId),
            amount: $amount,
            currency: $cur,
            tokens: $tokens,
            storage_bytes: $storage_bytes,
            status: 'completed',
            description: $desc,
            stripe_session_id: $sid,
            created_at: time::from::unix($ts)
          }
        `, {
          rawId: rawId,
          amount: session.amount_total || 0,
          cur: session.currency || 'usd',
          tokens: tokenAmount,
          storage_bytes: storageGb * 1024 * 1024 * 1024,
          desc: isToken ? `${(tokenAmount / 1000).toFixed(0)}k AI Token Pack` : (isStorage ? `${storageGb}GB Vault Storage Expansion` : 'Pro Subscription Upgrade'),
          sid: sid,
          ts: session.created
        })

        // Also update the actual token/storage balance on the user record during backfill
        if (isToken && tokenAmount > 0) {
          await db.query(`
              UPDATE type::thing('user', $rawId) SET 
                  purchased_tokens = <int>(purchased_tokens OR 0) + <int>$amount,
                  updated_at = time::now();
          `, { rawId, amount: tokenAmount });
        } else if (isStorage && storageGb > 0) {
          const storageBytes = storageGb * 1024 * 1024 * 1024;
          await db.query(`
              UPDATE type::thing('user', $rawId) SET 
                  purchased_storage = <int>(purchased_storage OR 0) + <int>$amount,
                  updated_at = time::now();
          `, { rawId, amount: storageBytes });
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

    if (!query || query.length < 2) {
      return c.json({ users: [] })
    }

    // Debug: Check total user count
    const [totalUsers] = await db.query(`SELECT count() as total FROM user GROUP ALL`);
    console.log(`[User Search] Total users in database: ${totalUsers?.[0]?.total || 0} `);

    // SurrealDB Search
    // Note: Use CONTAINS or string functions.
    // 'users' table is now 'user' table.
    // user ID is `user: uuid` but payload.sub might be just uuid? We assumed payload.sub matches.

    // We need to fetch ID but strip `user: ` prefix for frontend if frontend expects pure UUID.
    // Or we update frontend to handle prefixes. Ideally we strip it for compatibility.

    const [users] = await db.query(`
          SELECT
          string:: split(<string>id, ':')[1] as id,
            email,
            first_name,
            last_name,
            profile_picture_url
            FROM user
            WHERE (string::lowercase(email) CONTAINS string::lowercase($q)
            OR string::lowercase(first_name) CONTAINS string::lowercase($q)
            OR string::lowercase(last_name) CONTAINS string::lowercase($q))
            AND id != $user
            LIMIT 5;
            `, {
      q: query,
      user: `user:${payload.sub}`
    });

    console.log(`[User Search] Query: "${query}", Found: ${users?.length || 0} users`);
    if (users && users.length > 0) {
      console.log('[User Search] Results:', users.map(u => u.email));
    }

    return c.json({ users })
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
    const [requests] = await db.query(`
            SELECT
            id,
            user,
            reason,
            email,
            status,
            requested_at
            FROM experimental_request
            WHERE status = 'pending'
            ORDER BY requested_at DESC
            `);

    return c.json({ requests: requests || [] })
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
    await db.query(`
            UPDATE $requestId SET
            status = 'rejected',
            rejection_reason = $reason,
            reviewed_at = time::now(),
            reviewed_by = $reviewedBy
            `, {
      requestId,
      reason: reason || 'No reason provided',
      reviewedBy: adminPayload.sub
    });

    return c.json({ success: true })
  } catch (error) {
    console.error("Error rejecting experimental request:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Emergency Migration Endpoint - Fix missing user fields
app.get("/api/emergency-migrate-users", async (c) => {
  try {
    console.log('[Emergency Migration] Starting user field migration...');

    // Get all users and update their fields unconditionally
    const result = await db.query(`
      LET $users = (SELECT * FROM user);
      
      FOR $user IN $users {
        UPDATE $user.id SET 
          purchased_tokens = type::number($user.purchased_tokens ?? 0),
          purchased_storage = type::number($user.purchased_storage ?? 0),
          subscription_tier = type::string($user.subscription_tier ?? 'free'),
          stripe_customer_id = type::string($user.stripe_customer_id ?? "")
      };
      
      RETURN { count: count($users) };
    `);

    console.log('[Emergency Migration] Migration completed:', result);
    return c.json({
      success: true,
      message: 'User fields migrated successfully',
      result
    });
  } catch (e) {
    console.error('[Emergency Migration] Error:', e);
    return c.json({ success: false, error: e.message, stack: e.stack }, 500);
  }
})

// Test DB Route
app.get("/test-db", async (c) => {
  try {
    const rs = await db.query("RETURN {val: 1 }")
    return c.json({ success: true, rs })
  } catch (e) {
    return c.json({ success: false, error: e.message, stack: e.stack, url: process.env.TURSO_DB_URL }, 500)
  }
})

// Test Fetch Route (Bypass Client)
app.get("/test-fetch", async (c) => {
  const url = process.env.TURSO_DB_URL
  const token = process.env.TURSO_AUTH_TOKEN ? process.env.TURSO_AUTH_TOKEN.trim() : ""

  if (!url || !token) {
    return c.json({ error: "Missing URL or Token" }, 400)
  }

  // Convert libsql:// or https:// to https:// and append /v2/pipeline
  const httpUrl = url.replace("libsql://", "https://") + "/v2/pipeline"

  try {
    const response = await fetch(httpUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql: "SELECT 1" } },
          { type: "close" }
        ]
      })
    })

    const text = await response.text()
    return c.json({
      status: response.status,
      statusText: response.statusText,
      body: text,
      url: httpUrl
    })
  } catch (e) {
    return c.json({ error: e.message, stack: e.stack }, 500)
  }
})

// Test Adapter Route
app.get("/test-adapter", async (c) => {
  try {
    const { SQLiteAdapter } = await import('./adapters/sqliteAdapter.js')
    const config = {
      provider: 'sqlite',
      sqlite: {
        path: process.env.TURSO_DB_URL?.replace("libsql://", "https://"),
        authToken: process.env.TURSO_AUTH_TOKEN
      }
    }

    console.log("Testing SQLiteAdapter with config:", JSON.stringify(config, null, 2))

    const adapter = new SQLiteAdapter(config)
    await adapter.connect()
    const tables = await adapter.listCollections()

    return c.json({ success: true, tables })
  } catch (e) {
    return c.json({ success: false, error: e.message, stack: e.stack }, 500)
  }
})

// Fix User Route (Temporary)
// Fix User Route (Temporary) - Refactored for SurrealDB
app.get("/fix-user", async (c) => {
  try {
    const email = "batsteel209@gmail.com"

    // Get User ID
    const [user] = await db.query(`SELECT id FROM user WHERE email = $email LIMIT 1`, { email });

    if (!user || !user[0]) {
      return c.json({ success: false, message: "User not found" })
    }

    const userId = user[0].id; // `user:uuid`

    // Delete related data manually as we don't have CASCADE yet
    // SurrealDB approach: Delete by record ID or WHERE clause

    // We can run these in parallel or batch
    await db.query(`
            DELETE dashboard WHERE owner = $user;
            DELETE connection WHERE user = $user;
            -- Settings are on user record, so they go with user
            DELETE dashboard_element WHERE created_by = $user;
            DELETE query_history WHERE user = $user;
            DELETE chat WHERE user = $user;
            DELETE dashboard_permission WHERE user = $user;

            -- Finally delete user
            DELETE ${userId};
            `, { user: userId });

    return c.json({ success: true, message: `Deleted user ${email} and all related data` })
  } catch (e) {
    return c.json({ success: false, error: e.message, stack: e.stack }, 500)
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
app.get("/settings", async (c) => {
  const token = getAuthToken(c)
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    // Store settings directly on the user record? 
    // Or stick to `user_settings` concept?
    // Let's create a `user_settings` record where ID corresponds to user or random.
    // Ideally `user_settings` should be 1-to-1.
    // Let's store it ON THE USER record for simplicity in Surreal.
    // `user:uuid` -> field `settings` (object)

    const [user] = await db.query(`SELECT settings FROM user:${userId}`);
    // If not found, return empty
    if (!user || !user[0]) return c.json({ settings: {} })

    return c.json({ settings: user[0].settings || {} })
  } catch (error) {
    console.error("Fetch settings error:", error)
    return c.json({ error: "Failed to fetch settings" }, 500)
  }
})

app.post("/settings", async (c) => {
  const token = getAuthToken(c)
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    let userId = payload.sub
    const settings = await c.req.json()

    const resolvedId = await upsertUser(payload)
    if (resolvedId) {
      const parts = resolvedId.toString().split(':')
      if (parts.length > 1) userId = parts[1]
      else userId = resolvedId
    }

    // Merge settings into user record
    await db.query(`
            UPDATE user:${userId} MERGE {
              settings: $settings,
            updated_at: time::now()
        };
            `, { settings });

    return c.json({ ok: true })
  } catch (error) {
    console.error("Save settings error:", error)
    return c.json({ error: "Failed to save settings" }, 500)
  }
})

app.post("/query", async (c) => {
  const { provider, connection, query, source = 'user', model = null, tokens_used = 0 } = await c.req.json()
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

  const adapter = new Adapter({ ...connection, userId })
  let result = null
  let error = null
  let status = 'success'

  try {
    await adapter.connect()
    result = await adapter.query(query)
  } catch (err) {
    status = 'error'
    error = err.message
  } finally {
    await adapter.disconnect()
  }

  // Save history if user is logged in
  if (userId) {
    try {
      // Save history if user is logged in
      await db.query(`
              CREATE query_history CONTENT {
                  user: $user,
                  query: $query,
                  source: $source,
                  model: $model,
                  status: $status,
                  connection: $connection,
                  tokens_used: $tokens_used,
                  created_at: time::now()
              };
          `, {
        user: `user:${userId}`,
        query,
        source,
        model,
        status,
        connection: connection.id ? (connection.id.toString().includes(':') ? connection.id : `connection:${connection.id}`) : null,
        tokens_used: tokens_used || 0
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
    const [connResults] = await db.query(
      'SELECT * FROM connection WHERE id = type::thing("connection", $id)',
      { id: rawId }
    )

    if (!connResults || connResults.length === 0) {
      console.warn(`[query-by-id] Connection completely missing from DB: ${connId}`);
      return c.json({ error: `Connection not found: ${connId}` }, 404)
    }

    const connRow = connResults[0]
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

    // Build connection object for adapter
    const connection = { id: connId, ...config }

    const adapterKey = Object.keys(adapters).find(k => k.toLowerCase() === (provider || '').toLowerCase())
    const Adapter = adapters[adapterKey]

    if (!Adapter) {
      console.error(`[query-by-id] Provider not found for: ${provider}. Available:`, Object.keys(adapters))
      return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    const adapter = new Adapter(connection)
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



app.post("/schema", async (c) => {
  try {
    const body = await c.req.json()
    // console.log('[Backend] Schema request:', JSON.stringify(body, null, 2))
    const { provider, connection } = body

    const Adapter = adapters[provider]

    if (!Adapter) {
      return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    const adapter = new Adapter(connection)

    try {
      await adapter.connect()
      const tables = await adapter.listCollections()
      console.log(`[/schema] ${provider} returned ${tables.length} tables for database ${connection.database ?? 'unknown'}`)

      // For SurrealDB, fetch display names from uploads metadata
      let tableDisplayNames = {}
      if (provider === 'surrealdb') {
        for (const tableName of tables) {
          // Extract UUID from table name
          const uuidMatch = tableName.match(/^data_([a-f0-9]{32})_/i)
          if (uuidMatch) {
            const uuid = uuidMatch[1]
            // Note: SurrealDB uploads are stored without hyphens
            const uploadId = `uploads:${uuid}`

            try {
              console.log(`[Rename] Fetching display name for upload ID: ${uploadId}`)
              const query = `SELECT display_name FROM \`${uploadId}\``
              const [upload] = await db.query(query)
              if (upload[0]?.display_name) {
                console.log(`[/schema] Found display name for ${tableName}: ${upload[0].display_name}`)
                tableDisplayNames[tableName] = upload[0].display_name
              }
            } catch (e) {
              // If no display_name found, fall back to extracting from table name
              const displayNameMatch = tableName.match(/^data_[a-f0-9]{32}_(.+)$/i)
              if (displayNameMatch) {
                tableDisplayNames[tableName] = displayNameMatch[1]
              }
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
          const match = tableName.match(/^data_[a-f0-9]{32}_(.+)$/i)
          if (match) {
            return match[1]
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

      const previews = await Promise.all(
        tables.map(async (table) => {
          try {
            const rows = await adapter.sampleCollection(table, 3)
            return {
              table,
              displayName: cleanTableName(table),
              rows
            }
          } catch (error) {
            return {
              table,
              displayName: cleanTableName(table),
              rows: []
            }
          }
        }),
      )

      // Create metadata map for display names
      const tableMetadata = {}
      tables.forEach(t => {
        tableMetadata[t] = {
          displayName: cleanTableName(t),
          actualName: t
        }
      })

      return c.json({
        ok: true,
        tables,  // Keep as array of strings for backward compatibility
        tableMetadata,  // Add metadata separately
        previews,
        databases
      })
    } catch (err) {
      // Return a more structured error so the UI can show friendlier messages.
      // Many driver errors include a 'code' or 'name' property; include that when present.
      const code = (err && (err.code || err.name)) || 'UNKNOWN_ERROR'
      const message = err && err.message ? err.message : 'An unknown error occurred while probing the schema'
      return c.json({ error: message, code }, 500)
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

    const [queries] = await db.query(`
            SELECT * FROM query_history
            WHERE user = $user
            ORDER BY created_at DESC
            LIMIT 50;
            `, { user: `user:${userId}` });

    // Map to frontend expected format
    const mapped = queries.map(q => ({
      id: q.id.toString().split(':')[1] || q.id,
      query: q.query_text, // Assuming we store as `query_text` or `query`?
      // Wait, let's keep it consistent. If I insert `query` field, it's `query`.
      // `query` is a reserved keyword in some SQLs but valid field in Surreal.
      // Let's use `query_text` to be safe/clear?
      // Or stick to `query`.
      // Previous code used `query`.
      query: q.query,
      timestamp: new Date(q.created_at).getTime(),
      source: q.source,
      model: q.model,
      status: q.status,
      connection_id: q.connection ? (q.connection.toString().split(':')[1] || q.connection) : null
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
    const { query, source, status, connection_id, model, tokens_used } = await c.req.json()

    // Create record
    const [created] = await db.query(`
            CREATE query_history CONTENT {
              user: $user,
            query: $query,
            source: $source,
            model: $model,
            status: $status,
            connection: $connection,
            tokens_used: $tokens_used,
            created_at: time::now()
        };
            `, {
      user: `user:${userId}`,
      query,
      source: source || 'user',
      model: model || null,
      status: status || 'success',
      connection: connection_id ? (connection_id.includes(':') ? connection_id : `connection:${connection_id}`) : null,
      tokens_used: tokens_used || 0
    });

    return c.json({ id: created[0].id.toString().split(':')[1] || created[0].id })
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
    const queryId = `query_history:${id}`
    await db.query(`DELETE ${queryId} WHERE user = $user`, {
      user: `user:${payload.sub}`
    })

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
    await db.query(`DELETE query_history WHERE user = $user`, {
      user: `user:${payload.sub}`
    })

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


    const {
      tier,
      tokenLimit: limit,
      storageLimit,
      purchasedTokens,
      purchasedStorage
    } = await calculateUserLimits(db, `user:${userId}`);

    // Calculate start of current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get total tokens used THIS MONTH
    const [tokenResult] = await db.query(
      `SELECT math::sum(tokens_used) as total_tokens FROM query_history 
       WHERE user = $user AND created_at >= $start
            GROUP ALL`,
      {
        user: `user:${userId}`,
        start: startOfMonth
      }
    );
    const totalTokens = tokenResult[0]?.total_tokens || 0

    // Get storage used (approximate size of uploaded DBs)
    const [connResult] = await db.query(
      "SELECT config FROM connection WHERE user = $user AND provider = 'sqlite'",
      { user: `user:${userId}` }
    );

    let totalStorage = 0

    for (const row of connResult) {
      try {
        const config = JSON.parse(row.config)
        // Check for sqlite path in config
        // Config structure is usually {sqlite: {path: '...' } } based on other endpoints
        const sqliteConfig = config.sqlite

        if (sqliteConfig && sqliteConfig.path && sqliteConfig.path.startsWith('file:')) {
          const filePath = sqliteConfig.path.replace('file:', '')
          try {
            // Check if file is in our uploads directory to avoid reading system files
            if (filePath.includes('/uploads/')) {
              try {
                const stats = await fs.stat(filePath)
                totalStorage += stats.size
              } catch (e) {
                // If fs.stat fails (maybe it's a Bun file path), try Bun.file as fallback if available
                if (typeof Bun !== 'undefined') {
                  const file = Bun.file(filePath)
                  totalStorage += await file.size()
                }
              }
            }
          } catch (e) {
            // Ignore missing files
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

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

// Consolidated route mounting handled above

// initialization block
const isBun = typeof Bun !== 'undefined';
const startServer = async () => {
  try {
    // 1. Database
    await connectDB();
    console.log('[Main] Database connected');

    // 2. Schema initialization
    try {
      await initExperimentalTables(db)
      console.log('✅ Experimental features tables initialized')
    } catch (e) {
      console.warn('[Schema] Exp tables warning:', e.message)
    }

    try {
      await db.query(`
        DEFINE TABLE dashboard_message SCHEMAFULL;
        DEFINE FIELD dashboard ON TABLE dashboard_message TYPE record<dashboard>;
        DEFINE FIELD user ON TABLE dashboard_message TYPE record<user>;
        DEFINE FIELD content ON TABLE dashboard_message TYPE string;
        DEFINE FIELD created_at ON TABLE dashboard_message TYPE datetime DEFAULT time::now();
      `);
      console.log('[Schema] dashboard_message table defined');
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.error('[Schema] Failed to define dashboard_message:', e.message);
      }
    }

    // 3. Background services
    weatherService.start();

    if (process.env.NEON_DATABASE_URL) {
      initializeWeeklyDigest()
      console.log('[Main] Weekly digest cron initialized');
    }

    startPollingService();
    console.log('[Main] Data source polling service active');

    // 4. Start Server
    if (isVercel) {
      console.log('[Main] Vercel mode');
    } else {
      // Use Node adapter for both Node AND Bun to ensure Socket.io compatibility
      console.log(`[Main] Starting server on port ${port} (Runtime: ${isBun ? 'Bun (Node Compat)' : 'Node'})`);
      const server = serve({
        fetch: app.fetch,
        port: Number(port)
      });
      initSocketServer(server, allowedOrigins);
    }
  } catch (err) {
    console.error('[Fatal Startup Error]', err);
    process.exit(1);
  }
};

// Helper to create table and insert data (refactored to avoid duplication)
async function createTableAndInsertData(tableName, rows) {
  // Define schema
  const columnNames = new Set();
  rows.forEach(row => Object.keys(row).forEach(key => columnNames.add(key)));

  for (const colName of columnNames) {
    try {
      await db.query(`DEFINE FIELD \`${colName}\` ON TABLE ${tableName} FLEXIBLE PERMISSIONS FULL;`);
    } catch (e) { }
  }
  await db.query(`DEFINE FIELD _row_order ON TABLE ${tableName} TYPE option<number> PERMISSIONS FULL;`);

  // Batch Insert
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const safeChunk = chunk.map((row, idx) => {
      const newRow = { _row_order: i + idx };
      for (const key in row) newRow[key] = row[key];
      return newRow;
    });
    await db.insert(tableName, safeChunk);
  }
}

// Start the app
if (!isVercel) {
  startServer();
}

// Export for platforms
// On Vercel, we need the handler as default export
// On Bun, we export a dummy object to prevent Bun from auto-starting its own server
const defaultExport = isVercel ? handle(app) : (isBun ? { name: "pegasus-backend" } : app);
export default defaultExport;
export { app };
