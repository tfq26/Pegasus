import { Hono } from "hono"
import { cors } from "hono/cors"
import { adapters } from "./adapters/index.js"
import { serve } from '@hono/node-server'

const app = new Hono()

// CORS configuration - supports both development and production
// CORS configuration - supports both development and production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["http://localhost:5173", "http://127.0.0.1:5173"]

// CORS Configuration MUST be before routes
app.use("*", cors({
  origin: (origin) => {
    // Allow localhost/127.0.0.1
    if (!origin) return allowedOrigins[0];
    if (allowedOrigins.includes(origin)) return origin;

    // In development (no strict check), allow local network IPs/hostnames on port 5173
    // Allow any http://...:5173 origin in dev
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    if (!isProd) {
      // Match http://anything:5173
      if (/^http:\/\/.+:5173$/.test(origin)) {
        return origin;
      }
    }
    return allowedOrigins[0];
  },
  methods: ["GET", "POST", "OPTIONS", "DELETE", "PUT"],
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"]
}))


// Mount Routes
// dashboardRoutes defines paths like /dashboard and /dashboards internally.
// So we mount it at the root '/'.
app.route('/', dashboardRoutes)
app.route('/connections', connectionRoutes)
app.route('/api', tableRoutes)
// Mount Chat/AI Routes
app.route('/', chatRoutes)



import { authRoutes } from "./src/routes/auth.js"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"


import { db, connectDB } from "./db/surreal.js"
// Initialize DB Connection
const port = process.env.PORT || 3000;
await connectDB();
import { dashboardRoutes } from "./src/routes/dashboard.js"
import { connectionRoutes } from "./src/routes/connection.js"
import { tableRoutes } from "./src/routes/table.js"
import { chatRoutes } from "./src/routes/chat.js"
import { aiClient } from "./ai/AIClient.js"
import { initializeWeeklyDigest } from "./src/jobs/weeklyDigest.js"
import { parseExcel } from "./lib/excelParser.js"
import { parseXML, flattenXML } from "./lib/xmlParser.js"
import Stripe from "stripe"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { analyzeForSanitization } from "./ai/sanitizer.js"
import {
  EXPERIMENTAL_FEATURES,
  initExperimentalTables,
  getExperimentalStatus,
  getUserFeatureFlags,
  createExperimentalRequest,
  grantExperimentalAccess,
  toggleUserFeature
} from "./experimental-features.js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder")

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const redirectUri = process.env.WORKOS_REDIRECT_URI || "http://localhost:3000/auth/callback"

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
  try {
    const userId = payload.sub || payload.id
    const userRecordId = `user:${userId}`

    const [existing] = await db.query(`SELECT id FROM ${userRecordId}`);

    if (existing && existing.length > 0) {
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
    } else {
      await db.query(`
                CREATE ${userRecordId} CONTENT {
                    email: $email,
                    first_name: $firstName,
                    last_name: $lastName,
                    profile_picture_url: $pic,
                    created_at: time::now(),
                    updated_at: time::now()
                };
            `, {
        email: payload.email,
        firstName: payload.firstName || payload.first_name,
        lastName: payload.lastName || payload.last_name,
        pic: (payload.profilePictureUrl || payload.profile_picture_url) ?? null
      });
    }
  } catch (e) {
    console.error("[DB] Failed to upsert user:", e)
    throw e
  }
}

// Mount Auth Routes
app.route('/auth', authRoutes)


// File Upload Endpoint
// Migrated from Turso to SurrealDB
// We will store uploaded data in SurrealDB tables.
// Metadata in `uploads` table, data in `data_{uploadId}_{tableName}` tables.

app.post("/upload", async (c) => {
  try {
    const token = getCookie(c, "session")
    let userId = null
    if (token) {
      try {
        const payload = await verify(token, jwtSecret)
        userId = payload.sub
      } catch (e) { }
    }

    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400)
    }

    const fileName = file.name
    const fileSize = file.size
    const fileType = fileName.split('.').pop().toLowerCase()

    // Use SurrealDB friendly IDs (alphanumeric)
    const uploadUuid = crypto.randomUUID().replace(/-/g, '')
    const uploadId = `uploads:${uploadUuid}`

    const uploadDir = path.join(os.tmpdir(), "uploads")
    const tempFilePath = path.join(uploadDir, `${uploadUuid}_${fileName}`)

    // Ensure uploads dir exists
    await fs.mkdir(uploadDir, { recursive: true })

    // Save uploaded file temporarily
    await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

    let data = {}

    try {
      if (fileType === 'xlsx') {
        data = await parseExcel(tempFilePath)
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

    const createdTables = []

    // 1. Insert Metadata into Uploads DB (SurrealDB)
    // We explicitly define `id` to ensure we can reference it easily
    await db.create(uploadId, {
      user_id: userId ? `user:${userId}` : null,
      filename: fileName,
      size: fileSize,
      format: fileType,
      visibility: 'private',
      created_at: new Date()
    });

    // 2. Create tables and insert data into SurrealDB
    for (const [rawTableName, rows] of Object.entries(data)) {
      if (!rows || rows.length === 0) continue

      // Sanitize table name for SurrealDB
      // SurrealDB tables are best as snake_case alphanumeric
      const safeTableName = rawTableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      // Prefix with 'data_uploadId_' to isolate
      const uniqueTableName = `data_${uploadUuid}_${safeTableName}`;

      // Define schema for the table
      // Get all unique column names from the data
      const columnNames = new Set();
      rows.forEach(row => {
        Object.keys(row).forEach(key => columnNames.add(key));
      });

      console.log(`[Upload] Defining schema for ${uniqueTableName} with ${columnNames.size} columns`);

      // Define each field as flexible to allow any data type (numbers, strings, etc.)
      for (const colName of columnNames) {
        try {
          await db.query(`DEFINE FIELD \`${colName}\` ON TABLE ${uniqueTableName} FLEXIBLE PERMISSIONS FULL;`);
        } catch (e) {
          console.warn(`[Upload] Failed to define field ${colName}:`, e.message);
        }
      }

      // Also define _row_order for maintaining row order
      await db.query(`DEFINE FIELD _row_order ON TABLE ${uniqueTableName} TYPE option<number> PERMISSIONS FULL;`);

      // Batch Insert with row_order
      const chunkSize = 500
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)

        // Ensure data keys are safe and add row_order
        const safeChunk = chunk.map((row, idx) => {
          const newRow = { _row_order: i + idx };
          for (const key in row) {
            newRow[key] = row[key];
          }
          return newRow;
        });

        await db.insert(uniqueTableName, safeChunk);
      }

      createdTables.push(uniqueTableName)
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
app.post("/create-checkout-session", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const { priceId } = await c.req.json()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: payload.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${allowedOrigins[0]}/profile?success=true`,
      cancel_url: `${allowedOrigins[0]}/profile?canceled=true`,
    })

    return c.json({ url: session.url })
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

app.post("/create-portal-session", async (c) => {
  const token = getCookie(c, "session")
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
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const [user] = await db.query(`SELECT subscription_tier FROM user:${payload.sub}`);
    const tier = user[0]?.subscription_tier || 'free'
    return c.json({ tier })
  } catch (e) {
    return c.json({ error: "Failed to fetch status" }, 500)
  }
})

app.post("/webhook", async (c) => {
  const sig = c.req.header('stripe-signature')
  const body = await c.req.text()

  let event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return c.json({ error: `Webhook Error: ${err.message}` }, 400)
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object
      // Update user subscription status
      // Match by email
      await db.query(`
          UPDATE user SET 
             stripe_customer_id = $custId, 
             subscription_tier = 'pro' 
          WHERE email = $email;
      `, {
        custId: session.customer,
        email: session.customer_details.email
      });
      break
    case 'customer.subscription.deleted':
      const subscription = event.data.object
      await db.query(`
          UPDATE user SET subscription_tier = 'free' 
          WHERE stripe_customer_id = $custId;
      `, {
        custId: subscription.customer
      });
      break
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  return c.json({ received: true })
})

// Auth Routes moved to src/routes/auth.js

// User Search for Sharing
app.get("/api/users/search", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const query = c.req.query("q")

    if (!query || query.length < 2) {
      return c.json({ users: [] })
    }

    // SurrealDB Search
    // Note: Use CONTAINS or string functions.
    // 'users' table is now 'user' table.
    // user ID is `user:uuid` but payload.sub might be just uuid? We assumed payload.sub matches.

    // We need to fetch ID but strip `user:` prefix for frontend if frontend expects pure UUID.
    // Or we update frontend to handle prefixes. Ideally we strip it for compatibility.

    const [users] = await db.query(`
        SELECT 
            string::split(id, ':')[1] as id, 
            email, 
            first_name, 
            last_name, 
            profile_picture_url 
        FROM user 
        WHERE (email CONTAINS $q 
           OR first_name CONTAINS $q 
           OR last_name CONTAINS $q)
        AND id != $user
        LIMIT 5;
    `, {
      q: query,
      user: `user:${payload.sub}`
    });

    return c.json({ users })
  } catch (e) {
    console.error("User search failed:", e)
    return c.json({ error: "Search failed" }, 500)
  }
})

// ==================== EXPERIMENTAL FEATURES API ====================

// Get experimental status for current user
app.get("/api/experimental/status", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)
    return c.json(status)
  } catch (error) {
    console.error("Error getting experimental status:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Request experimental access
app.post("/api/experimental/request", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const { reason, email } = await c.req.json()

    if (!reason || reason.trim().length < 20) {
      return c.json({ error: "Reason must be at least 20 characters" }, 400)
    }

    const result = await createExperimentalRequest(db, payload.sub, reason, email)
    return c.json(result)
  } catch (error) {
    console.error("Error creating experimental request:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Get available experimental features
app.get("/api/experimental/features", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)

    if (!status.hasAccess) {
      return c.json({ error: "No experimental access" }, 403)
    }

    const enabledFeatures = await getUserFeatureFlags(db, payload.sub)
    const features = Object.values(EXPERIMENTAL_FEATURES).map(feature => ({
      ...feature,
      enabled: enabledFeatures.includes(feature.id)
    }))

    return c.json({ features })
  } catch (error) {
    console.error("Error getting experimental features:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Toggle a feature flag
app.post("/api/experimental/features/:featureId/toggle", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const status = await getExperimentalStatus(db, payload.sub)

    if (!status.hasAccess) {
      return c.json({ error: "No experimental access" }, 403)
    }

    const { featureId } = c.req.param()
    const { enabled } = await c.req.json()

    const featureExists = Object.values(EXPERIMENTAL_FEATURES).some(f => f.id === featureId)
    if (!featureExists) {
      return c.json({ error: "Invalid feature ID" }, 400)
    }

    const result = await toggleUserFeature(db, payload.sub, featureId, enabled)
    return c.json(result)
  } catch (error) {
    console.error("Error toggling feature:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Admin: Grant experimental access
app.post("/api/experimental/admin/grant", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const adminPayload = await verify(token, jwtSecret)
    // TODO: Add admin role check here

    const { userId } = await c.req.json()
    const result = await grantExperimentalAccess(db, userId, adminPayload.sub)
    return c.json(result)
  } catch (error) {
    console.error("Error granting experimental access:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Test DB Route
app.get("/test-db", async (c) => {
  try {
    const rs = await db.query("RETURN { val: 1 }")
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
  const token = getCookie(c, "session")
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
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const settings = await c.req.json()

    await upsertUser(payload)

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
  const { provider, connection, query, source = 'user', model = null } = await c.req.json()
  console.log(`[Backend] Received query request for provider: ${provider}`)

  // Try to get user session for history
  const token = getCookie(c, "session")
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
    await upsertUser(userPayload)
  }

  const Adapter = adapters[provider]

  if (!Adapter) {
    return c.json({ error: `Provider '${provider}' not supported` }, 400)
  }

  const adapter = new Adapter(connection)
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
   // Check indentreated_at: time::now()
              };
          `, {
        user: `user:${userId}`,
        query,
        source,
        model,
        status,
        connection: connection.id ? (connection.id.toString().includes(':') ? connection.id : `connection:${connection.id}`) : null
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

      // Clean up table names for SurrealDB uploads
      // Convert "data_uuid_sheetname" to just "sheetname"
      const cleanTableName = (tableName) => {
        if (provider === 'surrealdb' && tableName.startsWith('data_')) {
          // Pattern: data_{uuid}_{sheetname}
          const parts = tableName.split('_')
          if (parts.length >= 3) {
            // Return everything after the UUID (parts[0] = 'data', parts[1] = uuid, parts[2+] = sheet name)
            return parts.slice(2).join('_')
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
  const token = getCookie(c, "session")
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
  const token = getCookie(c, "session")
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
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    // Get total tokens used
    const tokenResult = await db.execute({
      sql: "SELECT SUM(tokens_used) as total_tokens FROM queries WHERE user_id = $userId",
      args: { userId }
    })
    const totalTokens = tokenResult.rows[0]?.total_tokens || 0

    // Get storage used (approximate size of uploaded DBs)
    // Get storage used (approximate size of uploaded DBs)
    const connResult = await db.execute({
      sql: "SELECT config FROM connections WHERE user_id = $userId AND provider = 'sqlite'",
      args: { userId }
    })

    let totalStorage = 0

    for (const row of connResult.rows) {
      try {
        const config = JSON.parse(row.config)
        // Check for sqlite path in config
        // Config structure is usually { sqlite: { path: '...' } } based on other endpoints
        const sqliteConfig = config.sqlite

        if (sqliteConfig && sqliteConfig.path && sqliteConfig.path.startsWith('file:')) {
          const filePath = sqliteConfig.path.replace('file:', '')
          try {
            // Check if file is in our uploads directory to avoid reading system files
            if (filePath.includes('/uploads/')) {
              const file = Bun.file(filePath)
              totalStorage += await file.size()
            }
          } catch (e) {
            // Ignore missing files
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return c.json({
      tokens: totalTokens,
      storage: totalStorage, // in bytes
      storageFormatted: (totalStorage / (1024 * 1024)).toFixed(2) + ' MB'
    })
  } catch (e) {
    console.error("Fetch usage error:", e)
    return c.json({ error: "Failed to fetch usage stats" }, 500)
  }
})

// Table Routes moved to src/routes/table.js

// Moved logic to end


// Initialize experimental features tables
try {
  await initExperimentalTables(db)
} catch (error) {
  console.error('Failed to initialize experimental tables:', error)
}

// Initialize weekly digest cron job only if Neon is configured
if (process.env.NEON_DATABASE_URL) {
  initializeWeeklyDigest()
} else {
  console.log('Skipping weekly digest cron job - NEON_DATABASE_URL not configured')
}

// Start Server
console.log(`Pegasus query gateway running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
});
