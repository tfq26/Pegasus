import { Hono } from "hono"
import { cors } from "hono/cors"
import { adapters } from "./adapters/index.js"

const app = new Hono()

// CORS configuration - supports both development and production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ["http://localhost:5173", "http://127.0.0.1:5173"]

app.use("*", cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "OPTIONS", "DELETE", "PUT"],
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"]
}))

import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"


import { db } from "./db/index.js"
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

const workos = new WorkOS(process.env.WORKOS_API_KEY)
const clientId = process.env.WORKOS_CLIENT_ID
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const redirectUri = process.env.WORKOS_REDIRECT_URI || "http://localhost:3000/auth/callback"

// Helper to ensure user exists in DB
const upsertUser = async (payload) => {
  try {
    const userId = payload.sub || payload.id

    // Check if user exists by email but with different ID
    const existingUserRs = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [payload.email]
    })

    if (existingUserRs.rows.length > 0) {
      const existingId = existingUserRs.rows[0].id

      if (existingId !== userId) {
        console.log(`[Auth] Email ${payload.email} exists with different ID (${existingId}). Cleaning up old user...`)
        const tables = ['dashboards', 'dashboards_v2', 'connections', 'user_settings', 'dashboard_elements', 'queries', 'chats']
        for (const table of tables) {
          await db.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [existingId] })
        }
        await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [existingId] })
      }
    }

    await db.execute({
      sql: `
        INSERT INTO users (id, email, first_name, last_name, profile_picture_url)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          profile_picture_url = excluded.profile_picture_url
      `,
      // Ensure we use the same ID we resolved above
      args: [
        userId,
        payload.email,
        payload.firstName,
        payload.lastName,
        (payload.profilePictureUrl || payload.profile_picture_url) ?? null
      ]
    })
  } catch (e) {
    console.error("Failed to upsert user:", e)
  }
}

// File Upload Endpoint
import { uploadsDb } from "./db/uploads.js"

// File Upload Endpoint
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
    const uuid = crypto.randomUUID().replace(/-/g, '_') // Remove dashes for cleaner table names
    const uploadId = crypto.randomUUID() // Standard UUID for metadata record

    const uploadDir = path.join(os.tmpdir(), "uploads")
    const tempFilePath = path.join(uploadDir, `${uuid}_${fileName}`)

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

    // 1. Insert Metadata into Uploads DB
    await uploadsDb.execute({
      sql: `INSERT INTO uploads (id, user_id, filename, size, format, visibility) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [uploadId, userId, fileName, fileSize, fileType, 'private']
    })

    // 2. Create tables and insert data into Uploads DB
    for (const [rawTableName, rows] of Object.entries(data)) {
      if (!rows || rows.length === 0) continue

      // Infer columns from first row
      const columns = Object.keys(rows[0])
      if (columns.length === 0) continue

      // Sanitize table name
      const safeTableName = rawTableName.replace(/[^a-zA-Z0-9_]/g, '_')
      const uniqueTableName = `data_${uploadId}_${safeTableName}`.replace(/-/g, '_')

      const createTableSql = `CREATE TABLE "${uniqueTableName}" (${columns.map(col => `"${col}" TEXT`).join(', ')})`
      await uploadsDb.execute(createTableSql)
      createdTables.push(uniqueTableName)

      // Batch Insert
      const chunkSize = 500
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize)

        const values = []
        const args = []

        for (const row of chunk) {
          const rowValues = columns.map(col => {
            const val = row[col]
            args.push(typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''))
            return '?'
          })
          values.push(`(${rowValues.join(', ')})`)
        }

        const insertSql = `INSERT INTO "${uniqueTableName}" (${columns.map(col => `"${col}"`).join(', ')}) VALUES ${values.join(', ')}`

        await uploadsDb.execute({
          sql: insertSql,
          args: args
        })
      }
    }

    return c.json({
      success: true,
      dbPath: uploadsDb.url,
      authToken: uploadsDb.authToken,
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
    const userRs = await db.execute({
      sql: "SELECT stripe_customer_id FROM users WHERE id = ?",
      args: [payload.sub]
    })

    const customerId = userRs.rows[0]?.stripe_customer_id

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
    const userRs = await db.execute({
      sql: "SELECT subscription_tier FROM users WHERE id = ?",
      args: [payload.sub]
    })

    const tier = userRs.rows[0]?.subscription_tier || 'free'
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
      await db.execute({
        sql: "UPDATE users SET stripe_customer_id = ?, subscription_tier = 'pro' WHERE email = ?",
        args: [session.customer, session.customer_details.email]
      })
      break
    case 'customer.subscription.deleted':
      const subscription = event.data.object
      await db.execute({
        sql: "UPDATE users SET subscription_tier = 'free' WHERE stripe_customer_id = ?",
        args: [subscription.customer]
      })
      break
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  return c.json({ received: true })
})

app.get("/auth/login", (c) => {
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: "authkit", // Or specific provider like 'google'
    clientId,
    redirectUri,
  })

  return c.redirect(authorizationUrl)
})

app.get("/auth/callback", async (c) => {
  const code = c.req.query("code")

  if (!code) {
    return c.json({ error: "No code provided" }, 400)
  }

  try {
    console.log("Auth Debug Info:")
    console.log("- Redirect URI:", redirectUri)
    console.log("- Client ID:", clientId)
    console.log("- API Key Loaded:", process.env.WORKOS_API_KEY ? "Yes (" + process.env.WORKOS_API_KEY.substring(0, 4) + "...)" : "No")

    const { user } = await workos.userManagement.authenticateWithCode({
      code,
      clientId,
      // Some providers/flows require redirectUri to match
      redirectUri,
    })

    console.log("WorkOS User Object:", JSON.stringify(user, null, 2))

    // Upsert user logic
    const existingUserRs = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [user.email]
    })

    if (existingUserRs.rows.length > 0) {
      const existingId = existingUserRs.rows[0].id
      if (existingId !== user.id) {
        console.log(`[Auth] Email ${user.email} exists with different ID (${existingId}). Cleaning up old user...`)
        // Delete old user and related data to avoid UNIQUE constraint error
        // (In a real app, you might want to merge data or prompt user)
        const tables = ['dashboards', 'dashboards_v2', 'connections', 'user_settings', 'dashboard_elements', 'queries', 'chats']
        for (const table of tables) {
          await db.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [existingId] })
        }
        await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [existingId] })
      }
    }

    await db.execute({
      sql: `
        INSERT INTO users (id, email, first_name, last_name, profile_picture_url)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          profile_picture_url = excluded.profile_picture_url
      `,
      args: [
        user.id,
        user.email,
        user.firstName,
        user.lastName,
        user.profile_picture_url || user.profilePictureUrl || null
      ]
    })

    const payload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null,
      organizationName: user.organizationName || user.organization?.name || null,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    }

    console.log("JWT Payload:", JSON.stringify(payload, null, 2))

    const token = await sign(payload, jwtSecret)

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

    setCookie(c, "session", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "None" : "Lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    })

    // Redirect to the first allowed origin (frontend)
    const frontendUrl = allowedOrigins[0] || "http://localhost:5173"
    return c.redirect(frontendUrl)
  } catch (error) {
    console.error("Auth error:", error)
    return c.json({ error: error.message }, 500)
  }
})

app.get("/auth/me", async (c) => {
  const token = getCookie(c, "session")

  if (!token) {
    return c.json({ user: null })
  }

  try {
    const payload = await verify(token, jwtSecret)

    // Get user's feature flags
    const featureFlags = await getUserFeatureFlags(db, payload.sub)

    return c.json({
      user: {
        ...payload,
        featureFlags // WorkOS-style feature flags array
      }
    })
  } catch (error) {
    return c.json({ error: "Invalid token" }, 401)
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
    const rs = await db.execute("SELECT 1 as val")
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
app.get("/fix-user", async (c) => {
  try {
    const email = "batsteel209@gmail.com"

    // Get User ID
    const userRs = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [email]
    })

    if (userRs.rows.length === 0) {
      return c.json({ success: false, message: "User not found" })
    }

    const userId = userRs.rows[0].id

    // Delete related data
    await db.execute({ sql: "DELETE FROM dashboards WHERE user_id = ?", args: [userId] })
    await db.execute({ sql: "DELETE FROM dashboards_v2 WHERE user_id = ?", args: [userId] })
    await db.execute({ sql: "DELETE FROM connections WHERE user_id = ?", args: [userId] })
    await db.execute({ sql: "DELETE FROM user_settings WHERE user_id = ?", args: [userId] })
    await db.execute({ sql: "DELETE FROM dashboard_elements WHERE user_id = ?", args: [userId] })
    await db.execute({ sql: "DELETE FROM queries WHERE user_id = ?", args: [userId] })

    // Delete chats (messages should cascade)
    await db.execute({ sql: "DELETE FROM chats WHERE user_id = ?", args: [userId] })

    // Finally delete user
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] })

    return c.json({ success: true, message: `Deleted user ${email} and all related data` })
  } catch (e) {
    return c.json({ success: false, error: e.message, stack: e.stack }, 500)
  }
})

// Chat Routes
app.get("/chats", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT * FROM chats WHERE user_id = $userId ORDER BY updated_at DESC",
      args: { userId }
    })
    const chats = rs.rows
    return c.json({ chats })
  } catch (e) {
    return c.json({ error: "Unauthorized" }, 401)
  }
})

app.post("/chats", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    await upsertUser(payload)
    const { title } = await c.req.json()

    const id = crypto.randomUUID()
    await db.execute({
      sql: "INSERT INTO chats (id, user_id, title) VALUES ($id, $userId, $title)",
      args: {
        id,
        userId,
        title: title || "New Chat"
      }
    })

    return c.json({ id, title })
  } catch (e) {
    return c.json({ error: "Failed to create chat" }, 500)
  }
})

app.get("/chats/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const chatId = c.req.param("id")

    const chatRs = await db.execute({
      sql: "SELECT * FROM chats WHERE id = $id AND user_id = $userId",
      args: { id: chatId, userId }
    })
    const chat = chatRs.rows[0]
    if (!chat) return c.json({ error: "Chat not found" }, 404)

    let messages = []
    try {
      if (chat.messages && chat.messages !== '[]') {
        messages = JSON.parse(chat.messages)
      } else {
        // Fallback to legacy messages table
        const msgsRs = await db.execute({
          sql: "SELECT * FROM messages WHERE chat_id = $chatId ORDER BY created_at ASC",
          args: { chatId }
        })
        messages = msgsRs.rows

        // Lazy migration: Save to chat blob
        if (messages.length > 0) {
          await db.execute({
            sql: "UPDATE chats SET messages = $messages WHERE id = $id",
            args: {
              id: chatId,
              messages: JSON.stringify(messages)
            }
          })
        }
      }
    } catch (e) {
      console.error("Failed to parse chat messages:", e)
      messages = []
    }

    return c.json({ chat, messages })
  } catch (e) {
    return c.json({ error: "Failed to fetch chat" }, 500)
  }
})

app.post("/chats/:id/messages", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    await upsertUser(payload)
    const chatId = c.req.param("id")
    const { role, content } = await c.req.json()

    const chatRs = await db.execute({
      sql: "SELECT * FROM chats WHERE id = $id AND user_id = $userId",
      args: { id: chatId, userId }
    })
    const chat = chatRs.rows[0]
    if (!chat) return c.json({ error: "Chat not found" }, 404)

    let messages = []
    try {
      messages = chat.messages ? JSON.parse(chat.messages) : []
    } catch (e) { messages = [] }

    // Fallback: If empty, check legacy table to ensure we don't overwrite history
    if (messages.length === 0) {
      const msgsRs = await db.execute({
        sql: "SELECT * FROM messages WHERE chat_id = $chatId ORDER BY created_at ASC",
        args: { chatId }
      })
      if (msgsRs.rows.length > 0) messages = msgsRs.rows
    }

    const newMessage = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      role,
      content,
      created_at: Math.floor(Date.now() / 1000)
    }

    messages.push(newMessage)

    await db.execute({
      sql: "UPDATE chats SET messages = $messages, updated_at = unixepoch() WHERE id = $id",
      args: {
        id: chatId,
        messages: JSON.stringify(messages)
      }
    })

    console.log(`[DB] Saved message to chat ${chatId} (Blob size: ${messages.length})`)

    // Background Task: Auto-label chat if it's new and has enough context
    if (chat.title === 'New Chat' && messages.length >= 2) {
      // Fire and forget - do not await
      (async () => {
        try {
          console.log(`[AI] Generating title for chat ${chatId}...`)
          const newTitle = await aiClient.generateTitle(messages)
          if (newTitle) {
            await db.execute({
              sql: "UPDATE chats SET title = $title WHERE id = $id",
              args: { id: chatId, title: newTitle }
            })
            console.log(`[AI] Updated chat ${chatId} title to: "${newTitle}"`)
          }
        } catch (e) {
          console.error("[AI] Failed to auto-label chat:", e)
        }
      })()
    }

    return c.json({ id: newMessage.id })
  } catch (e) {
    return c.json({ error: "Failed to save message" }, 500)
  }
})

// --- AI Formula Endpoints ---

const colIndexToLabel = (index) => {
  let label = '';
  index++;
  while (index > 0) {
    let remainder = (index - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    index = Math.floor((index - 1) / 26);
  }
  return label;
};

// Helper to build formula generation prompt
const buildFormulaPrompt = (request, spreadsheetData, autoExecute) => {
  const { headers, sampleData } = spreadsheetData;
  const headerStr = headers.map((h, i) => `${colIndexToLabel(i)}: ${h}`).join(', ');
  const dataStr = sampleData.map((row, i) =>
    `Row ${i + 2}: ${row.join(' | ')}`
  ).join('\n');

  return `
You are an expert Excel/Spreadsheet formula generator.
User Request: "${request}"

Spreadsheet Context:
Headers: ${headerStr}
Sample Data:
${dataStr}

Task: Generate a valid Excel formula to fulfill the request.
Return a JSON object.

Format:
{
  "ambiguous": false,
  "formula": "=AVERAGEIF($A:$A, A2, $B:$B)",
  "targetColumn": 3,
  "columnHeader": "Average Price",
  "reasoning": "Explanation...",
  "exampleResult": "45.67",
  "isOverwrite": false
}

If ambiguous, return:
{
  "ambiguous": true,
  "clarificationNeeded": "Question...",
  "options": ["Option 1", "Option 2"]
}

Rules:
1. Use standard Excel functions including:
   - Math: SUM, AVERAGE, COUNT, MAX, MIN, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, ABS, POWER, SQRT
   - Logical: IF, AND, OR, NOT, IFERROR, IFNA
   - Text: CONCATENATE, LEFT, RIGHT, MID, LEN, TRIM, UPPER, LOWER, PROPER
   - Lookup: VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP
   - Date: TODAY, NOW, DATE, YEAR, MONTH, DAY, DATEDIF
   - Statistical: AVERAGEIF, SUMIF, COUNTIF, MEDIAN, MODE
   - And any other valid Excel function as needed
2. Use absolute references ($A$1) where appropriate, relative (A1) for row-by-row.
3. targetColumn is 0-based index. If creating a new column, use the next available index.
4. columnHeader should be a concise, descriptive name for the new column (e.g., "Total Price", "Profit Margin").
5. If the request implies filling a column, provide the formula for the *first data row* (Row 2).
6. Calculate exampleResult based on Row 2 data provided.
7. Set isOverwrite=true if targetColumn has data in sample.
`;
};

app.post("/ai/generate-formula", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const { request, spreadsheetData, model, autoExecute } = await c.req.json()

    // Build Prompt
    const prompt = buildFormulaPrompt(request, spreadsheetData, autoExecute)

    // Call AI
    const response = await aiClient.generateContent([
      { role: 'user', content: prompt }
    ], { json: true, model })

    console.log('AI Raw Response:', response)

    let result
    try {
      result = JSON.parse(response)
    } catch (parseError) {
      console.error('Failed to parse AI response:', response)
      return c.json({
        error: 'AI returned invalid response format',
        details: response?.substring(0, 200)
      }, 500)
    }

    // Check for ambiguity
    if (result.ambiguous) {
      return c.json({
        ambiguous: true,
        clarificationNeeded: result.clarificationNeeded,
        options: result.options
      })
    }

    // Check if will modify existing data
    const willModifyExistingData = checkIfModifiesData(
      result.targetColumn,
      spreadsheetData,
      result.isOverwrite
    )

    return c.json({
      formula: result.formula,
      targetColumn: result.targetColumn,
      columnHeader: result.columnHeader || 'New Column',
      reasoning: result.reasoning,
      exampleResult: result.exampleResult,
      willModifyExistingData,
      affectedCells: willModifyExistingData ?
        `Column ${colIndexToLabel(result.targetColumn)}` :
        null
    })
  } catch (e) {
    console.error("AI Generation Error:", e)
    return c.json({ error: e.message }, 500)
  }
})

// Helper to check if operation will modify existing data
function checkIfModifiesData(targetColumn, spreadsheetData, isOverwrite) {
  // Check if target column has any existing data in the sample
  // sampleData is array of arrays
  if (!spreadsheetData.sampleData) return false;

  for (const row of spreadsheetData.sampleData) {
    // Check if index exists and has content
    if (row[targetColumn] !== undefined && row[targetColumn] !== '' && row[targetColumn] !== null) {
      return true;
    }
  }
  return isOverwrite === true;
}

app.post("/ai/analyze-formula-error", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const { context, model } = await c.req.json()

    const prompt = `
You are an expert Excel formula debugger.
Context:
Formula: ${context.formula}
Result: ${context.result}
Cell: ${context.cellPosition}
Row Data: ${JSON.stringify(context.rowData)}
Headers: ${JSON.stringify(context.headers)}

Task: Analyze why this formula is producing an error or unexpected result.
Return JSON:
{
  "explanation": "Brief explanation of the error...",
  "suggestedFix": "=CORRECTED_FORMULA(...)"
}
`;

    const response = await aiClient.generateContent([
      { role: 'user', content: prompt }
    ], { json: true, model })

    return c.json(JSON.parse(response))

  } catch (e) {
    return c.json({ error: "Analysis failed" }, 500)
  }
})

// Dashboard Routes
app.get("/dashboard", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT * FROM dashboard_elements WHERE user_id = $userId ORDER BY created_at DESC",
      args: { userId }
    })
    const elements = rs.rows
    return c.json({ elements })
  } catch (e) {
    return c.json({ error: "Failed to fetch dashboard" }, 500)
  }
})

app.post("/dashboard/elements", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    await upsertUser(payload)
    const { type, title, config, query } = await c.req.json()

    const id = crypto.randomUUID()
    await db.execute({
      sql: "INSERT INTO dashboard_elements (id, user_id, type, title, config, query) VALUES ($id, $userId, $type, $title, $config, $query)",
      args: {
        id,
        userId,
        type,
        title,
        config: typeof config === 'string' ? config : JSON.stringify(config),
        query
      }
    })

    return c.json({ id })
  } catch (e) {
    return c.json({ error: "Failed to create dashboard element" }, 500)
  }
})

app.delete("/dashboard/elements/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")

    await db.execute({
      sql: "DELETE FROM dashboard_elements WHERE id = $id AND user_id = $userId",
      args: { id, userId }
    })

    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: "Failed to delete dashboard element" }, 500)
  }
})

app.put("/dashboard/elements/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")
    const { query, config, title } = await c.req.json()

    await db.execute({
      sql: `
        UPDATE dashboard_elements 
        SET query = COALESCE($query, query),
            config = COALESCE($config, config),
            title = COALESCE($title, title)
        WHERE id = $id AND user_id = $userId
      `,
      args: {
        id,
        userId,
        query: query !== undefined ? query : null,
        config: config ? (typeof config === 'string' ? config : JSON.stringify(config)) : null,
        title: title !== undefined ? title : null
      }
    })

    return c.json({ ok: true })
  } catch (e) {
    console.error("Failed to update dashboard element:", e)
    return c.json({ error: "Failed to update dashboard element" }, 500)
  }
})

app.get("/auth/logout", (c) => {
  deleteCookie(c, "session")
  return c.redirect("http://localhost:5173")
})

// Dashboard Endpoints
app.get("/dashboard/layout", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT layout FROM dashboards WHERE user_id = $userId",
      args: { userId }
    })
    const result = rs.rows[0]

    if (result && result.layout) {
      return c.json({ layout: JSON.parse(result.layout) })
    }

    return c.json({ layout: null })
  } catch (error) {
    return c.json({ error: "Unauthorized" }, 401)
  }
})

app.post("/dashboard/layout", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    await upsertUser(payload)
    const { layout } = await c.req.json()

    await db.execute({
      sql: `
        INSERT INTO dashboards (user_id, layout, updated_at)
        VALUES ($userId, $layout, unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET
          layout = excluded.layout,
          updated_at = unixepoch()
      `,
      args: {
        userId,
        layout: JSON.stringify(layout)
      }
    })

    return c.json({ ok: true })
  } catch (error) {
    console.error("Dashboard save error:", error)
    return c.json({ error: "Failed to save" }, 500)
  }
})

// Dashboard V2 Endpoints (Multi-dashboard)
app.get("/dashboards", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const rs = await db.execute({
      sql: "SELECT id, title, is_public, share_token, updated_at FROM dashboards_v2 WHERE user_id = $userId ORDER BY updated_at DESC",
      args: { userId }
    })
    return c.json({ dashboards: rs.rows })
  } catch (e) {
    return c.json({ error: "Failed to fetch dashboards" }, 500)
  }
})

app.post("/dashboards", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { title, data } = await c.req.json()
    const id = crypto.randomUUID()
    await db.execute({
      sql: "INSERT INTO dashboards_v2 (id, user_id, title, data) VALUES ($id, $userId, $title, $data)",
      args: { id, userId, title, data: JSON.stringify(data) }
    })
    return c.json({ id })
  } catch (e) {
    return c.json({ error: "Failed to create dashboard" }, 500)
  }
})

app.get("/dashboards/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")
    const rs = await db.execute({
      sql: "SELECT * FROM dashboards_v2 WHERE id = $id AND user_id = $userId",
      args: { id, userId }
    })
    if (rs.rows.length === 0) return c.json({ error: "Dashboard not found" }, 404)
    const dashboard = rs.rows[0]
    dashboard.data = JSON.parse(dashboard.data)
    return c.json({ dashboard })
  } catch (e) {
    return c.json({ error: "Failed to fetch dashboard" }, 500)
  }
})

app.put("/dashboards/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")
    const { title, data } = await c.req.json()

    console.log(`[Backend] Updating dashboard ${id} for user ${userId}`)
    if (data) console.log(`[Backend] New data element count: ${data.elements?.length}`)

    const result = await db.execute({
      sql: `UPDATE dashboards_v2 SET 
            title = COALESCE($title, title), 
            data = COALESCE($data, data), 
            updated_at = unixepoch() 
            WHERE id = $id AND user_id = $userId`,
      args: {
        id,
        userId,
        title: title || null,
        data: data ? JSON.stringify(data) : null
      }
    })

    console.log(`[Backend] Update result: ${JSON.stringify(result)}`)

    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: "Failed to update dashboard" }, 500)
  }
})

app.delete("/dashboards/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")
    await db.execute({
      sql: "DELETE FROM dashboards_v2 WHERE id = $id AND user_id = $userId",
      args: { id, userId }
    })
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: "Failed to delete dashboard" }, 500)
  }
})

app.post("/dashboards/:id/share", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const id = c.req.param("id")

    // Generate a secure token if one doesn't exist
    const shareToken = crypto.randomUUID()

    await db.execute({
      sql: "UPDATE dashboards_v2 SET share_token = COALESCE(share_token, $token), is_public = 1 WHERE id = $id AND user_id = $userId",
      args: { id, userId, token: shareToken }
    })

    const rs = await db.execute({
      sql: "SELECT share_token FROM dashboards_v2 WHERE id = $id AND user_id = $userId",
      args: { id, userId }
    })

    return c.json({ token: rs.rows[0].share_token })
  } catch (e) {
    return c.json({ error: "Failed to share dashboard" }, 500)
  }
})

app.get("/shared/dashboard/:token", async (c) => {
  try {
    const token = c.req.param("token")
    const rs = await db.execute({
      sql: "SELECT title, data, updated_at FROM dashboards_v2 WHERE share_token = $token AND is_public = 1",
      args: { token }
    })

    if (rs.rows.length === 0) return c.json({ error: "Dashboard not found or not public" }, 404)

    const dashboard = rs.rows[0]
    dashboard.data = JSON.parse(dashboard.data)
    return c.json({ dashboard })
  } catch (e) {
    return c.json({ error: "Failed to fetch shared dashboard" }, 500)
  }
})

// Connections Endpoints
app.get("/connections", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT * FROM connections WHERE user_id = $userId ORDER BY created_at ASC",
      args: { userId }
    })
    const results = rs.rows

    const connections = results.map(row => {
      const config = JSON.parse(row.config)
      const entry = {
        id: row.id,
        nickname: row.nickname,
        description: row.description,
        provider: row.provider,
        ...config
      }
      return entry
    })

    return c.json({ connections })
  } catch (error) {
    return c.json({ error: "Unauthorized" }, 401)
  }
})

app.post("/connections", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const connection = await c.req.json()

    // Helper to ensure user exists (in case of fresh DB with old session)
    await upsertUser(payload)

    // Extract config based on provider
    let config = {}
    if (connection.provider === 'mysql') config = { mysql: connection.mysql }
    else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
    else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
    else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
    else if (connection.provider === 'postgres') config = { postgres: connection.postgres }

    await db.execute({
      sql: `
        INSERT INTO connections (id, user_id, nickname, description, provider, config, created_at)
        VALUES (?, ?, ?, ?, ?, ?, unixepoch())
      `,
      args: [
        connection.id || crypto.randomUUID(),
        userId,
        connection.nickname,
        connection.description ?? null,
        connection.provider,
        JSON.stringify(config)
      ]
    })

    return c.json({ ok: true })
  } catch (error) {
    console.error("Connection save error:", error)
    return c.json({ error: "Failed to save connection" }, 500)
  }
})

// Update connection
app.put("/connections/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const connectionId = c.req.param('id')
    const connection = await c.req.json()

    // Helper to ensure user exists (in case of fresh DB with old session)
    await upsertUser(payload)

    // Extract config based on provider
    let config = {}
    if (connection.provider === 'mysql') config = { mysql: connection.mysql }
    else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
    else if (connection.provider === 'kusto') config = { kusto: connection.kusto }
    else if (connection.provider === 'sqlite') config = { sqlite: connection.sqlite }
    else if (connection.provider === 'postgres') config = { postgres: connection.postgres }

    const result = await db.execute({
      sql: `
        UPDATE connections 
        SET nickname = $nickname,
            description = $description,
            provider = $provider,
            config = $config
        WHERE id = $id AND user_id = $userId
      `,
      args: {
        id: connectionId,
        userId,
        nickname: connection.nickname,
        description: connection.description ?? null,
        provider: connection.provider,
        config: JSON.stringify(config)
      }
    })

    if (result.rowsAffected === 0) {
      return c.json({ error: "Connection not found or not authorized" }, 404)
    }

    return c.json({ ok: true })
  } catch (error) {
    console.error("Connection update error:", error)
    return c.json({ error: "Failed to update connection" }, 500)
  }
})

app.delete("/connections/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const connectionId = c.req.param('id')

    await db.execute({
      sql: "DELETE FROM connections WHERE id = $id AND user_id = $userId",
      args: { id: connectionId, userId }
    })

    return c.json({ ok: true })
  } catch (error) {
    console.error("Connection delete error:", error)
    return c.json({ error: "Failed to delete connection" }, 500)
  }
})

// Settings Routes
app.get("/settings", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
      args: { userId }
    })

    if (rs.rows.length > 0) {
      return c.json({ settings: JSON.parse(rs.rows[0].settings) })
    }

    return c.json({ settings: {} })
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

    // Ensure user exists
    await upsertUser(payload)

    // Check if settings exist
    const check = await db.execute({
      sql: "SELECT 1 FROM user_settings WHERE user_id = $userId",
      args: { userId }
    })

    if (check.rows.length > 0) {
      await db.execute({
        sql: "UPDATE user_settings SET settings = $settings, updated_at = unixepoch() WHERE user_id = $userId",
        args: { userId, settings: JSON.stringify(settings) }
      })
    } else {
      await db.execute({
        sql: "INSERT INTO user_settings (user_id, settings) VALUES ($userId, $settings)",
        args: { userId, settings: JSON.stringify(settings) }
      })
    }

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
      await db.execute({
        sql: `INSERT INTO queries (id, user_id, query, source, model, status, connection_id) 
              VALUES ($id, $userId, $query, $source, $model, $status, $connectionId)`,
        args: {
          id: crypto.randomUUID(),
          userId,
          query,
          source,
          model,
          status,
          connectionId: connection.id || null
        }
      })
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
            return { table, rows }
          } catch (error) {
            return { table, rows: [] }
          }
        }),
      )
      return c.json({ ok: true, tables, previews, databases })
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

app.post("/ai/generate", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { prompt, connectionId, context } = await c.req.json()

    // 1. Fetch connection details
    const rs = await db.execute({
      sql: "SELECT * FROM connections WHERE id = $id AND user_id = $userId",
      args: { id: connectionId, userId }
    })
    const connRow = rs.rows[0]

    if (!connRow) {
      return c.json({ error: "Connection not found" }, 404)
    }

    const config = JSON.parse(connRow.config)
    const provider = connRow.provider
    const adapterConfig = config[provider]


    // 2. Fetch Schema
    const Adapter = adapters[provider]
    if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

    const adapter = new Adapter(adapterConfig)

    let schemaInfo = {}
    try {
      await adapter.connect()
      const allTables = await adapter.listCollections()

      // Smart filtering for large schemas
      let relevantTables = allTables
      const MAX_COLLECTIONS = 50 // Maximum collections to send to AI

      if (allTables.length > MAX_COLLECTIONS) {
        // Use simple keyword matching to find relevant collections
        const keywords = prompt.toLowerCase()
          .split(/\s+/)
          .filter(word => word.length > 2) // Filter out short words
          .filter(word => !['the', 'and', 'for', 'with', 'from', 'show', 'get', 'find', 'all'].includes(word))

        // Score each collection based on keyword matches
        const scored = allTables.map(table => {
          const tableLower = table.toLowerCase()
          let score = 0

          keywords.forEach(keyword => {
            if (tableLower.includes(keyword)) {
              score += 10
            }
            // Partial match bonus
            if (tableLower.split(/[._-]/).some(part => part.startsWith(keyword))) {
              score += 5
            }
          })

          return { table, score }
        })

        // Sort by score and take top matches
        relevantTables = scored
          .filter(item => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_COLLECTIONS)
          .map(item => item.table)

        // If no matches found, take first 50 collections
        if (relevantTables.length === 0) {
          relevantTables = allTables.slice(0, MAX_COLLECTIONS)
        }

        console.log(`[AI] Filtered ${allTables.length} collections to ${relevantTables.length} relevant ones`)
      }

      // For MongoDB, fetch sample documents to understand structure
      if (provider === 'mongodb' && relevantTables.length > 0) {
        const samples = {}
        const sampleValues = {} // Store sample string values for ambiguity detection

        // Limit sampling to avoid overwhelming the AI
        const collectionsToSample = relevantTables.slice(0, 20)

        for (const collection of collectionsToSample) {
          try {
            const sampleDocs = await adapter.sampleCollection(collection, 5) // Increased sample size slightly
            if (sampleDocs && sampleDocs.length > 0) {
              // Get field names from the sample document
              samples[collection] = Object.keys(sampleDocs[0])

              // Extract string values for context
              sampleValues[collection] = {}
              sampleDocs.forEach(doc => {
                Object.entries(doc).forEach(([key, value]) => {
                  if (typeof value === 'string' && value.length > 2 && value.length < 50) {
                    if (!sampleValues[collection][key]) sampleValues[collection][key] = new Set()
                    if (sampleValues[collection][key].size < 5) { // Limit to 5 distinct values per field
                      sampleValues[collection][key].add(value)
                    }
                  }
                })
              })

              // Convert Sets to Arrays for JSON serialization
              Object.keys(sampleValues[collection]).forEach(key => {
                sampleValues[collection][key] = Array.from(sampleValues[collection][key])
                if (sampleValues[collection][key].length === 0) delete sampleValues[collection][key]
              })
            }
          } catch (e) {
            // Skip collections we can't sample
          }
        }

        schemaInfo = {
          collections: relevantTables,
          samples,
          sampleValues, // Pass extracted values
          totalCollections: allTables.length,
          filtered: allTables.length > MAX_COLLECTIONS
        }
      } else {
        // For SQL/Kusto, extract sample values similar to MongoDB
        const sampleValues = {}
        const tablesToSample = relevantTables.slice(0, 20)

        for (const table of tablesToSample) {
          try {
            const sampleRows = await adapter.sampleCollection(table, 5)
            if (sampleRows && sampleRows.length > 0) {
              sampleValues[table] = {}
              sampleRows.forEach(row => {
                Object.entries(row).forEach(([key, value]) => {
                  if (typeof value === 'string' && value.length > 2 && value.length < 50) {
                    if (!sampleValues[table][key]) sampleValues[table][key] = new Set()
                    if (sampleValues[table][key].size < 5) {
                      sampleValues[table][key].add(value)
                    }
                  }
                })
              })

              // Convert Sets to Arrays for JSON serialization
              Object.keys(sampleValues[table]).forEach(key => {
                sampleValues[table][key] = Array.from(sampleValues[table][key])
                if (sampleValues[table][key].length === 0) delete sampleValues[table][key]
              })
            }
          } catch (e) {
            // Skip tables we can't sample
          }
        }

        // Use enhanced schema if available (SQLite/MySQL)
        let detailedSchema = null
        if (typeof adapter.getSchema === 'function') {
          try {
            const fullSchema = await adapter.getSchema()
            // Filter detailed schema to only relevant tables
            detailedSchema = {}
            for (const table of relevantTables) {
              if (fullSchema[table]) {
                detailedSchema[table] = fullSchema[table]
              }
            }
          } catch (e) {
            console.warn('Failed to fetch detailed schema:', e)
          }
        }

        schemaInfo = {
          tables: relevantTables,
          detailedSchema,
          sampleValues,
          totalTables: allTables.length,
          filtered: allTables.length > MAX_COLLECTIONS
        }
      }
    } catch (e) {
      console.warn("Failed to fetch schema for AI context:", e)
      schemaInfo = provider === 'mongodb' ? { collections: [], samples: {}, sampleValues: {} } : { tables: [] }
    } finally {
      try { await adapter.disconnect() } catch (e) { }
    }

    // 3. Generate Query
    const aiContext = {
      dialect: provider,
      schema: schemaInfo,
      previousContext: context
    }

    // Fetch user settings to get active model and other preferences
    let aiSettings = { modelId: null, temperature: 0.7, maxTokens: 2000, customInstructions: '', aiDetail: 1, language: 'English' }
    try {
      const settingsRes = await db.execute({
        sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
        args: { userId }
      })
      if (settingsRes.rows.length > 0) {
        const settings = JSON.parse(settingsRes.rows[0].settings)
        aiSettings = {
          modelId: settings.activeModel,
          temperature: settings.temperature ?? 0.7,
          maxTokens: settings.maxTokens ?? 2000,
          customInstructions: settings.customInstructions ?? '',
          aiDetail: settings.aiDetail ?? 1,
          language: settings.language ?? 'English'
        }
      }
    } catch (e) {
      console.warn("Failed to fetch user settings for AI model:", e)
    }

    const result = await aiClient.generateQuery(prompt, aiContext, aiSettings)

    // Handle both string (legacy) and object response
    const generatedQuery = typeof result === 'string' ? result : result.text
    const usage = typeof result === 'string' ? null : result.usage

    return c.json({ query: generatedQuery, usage })
  } catch (error) {
    console.error("AI Generation Error:", error)
    return c.json({ error: error.message }, 500)
  }
})

app.post("/ai/recommend-visualization", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const { query, results, previousConfig } = await c.req.json()

    console.log("[AI Viz] Request received:", {
      query,
      resultsCount: results?.length,
      hasPreviousConfig: !!previousConfig
    })

    if (!results || !Array.isArray(results) || results.length === 0) {
      return c.json({ error: "No results provided for analysis" }, 400)
    }

    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    // Fetch user settings to get active model
    let activeModel = null
    try {
      const settingsRes = await db.execute({
        sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
        args: { userId }
      })
      if (settingsRes.rows.length > 0) {
        const settings = JSON.parse(settingsRes.rows[0].settings)
        activeModel = settings.activeModel
      }
    } catch (e) {
      console.warn("Failed to fetch user settings for AI model:", e)
    }

    const recommendation = await aiClient.recommendVisualization(query, results, previousConfig, activeModel)

    console.log("[AI Viz] Recommendation generated:", recommendation ? recommendation.type : 'null')

    if (!recommendation) {
      return c.json({ error: "Failed to generate recommendation" }, 500)
    }

    return c.json(recommendation)
  } catch (e) {
    console.error("AI Recommendation Error:", e)
    return c.json({ error: e.message || "Failed to generate recommendation" }, 500)
  }
})

app.post("/ai/analyze", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { question, results, query } = await c.req.json()

    // Fetch user settings to get active model
    let activeModel = null
    try {
      const settingsRes = await db.execute({
        sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
        args: { userId }
      })
      if (settingsRes.rows.length > 0) {
        const settings = JSON.parse(settingsRes.rows[0].settings)
        activeModel = settings.activeModel
      }
    } catch (e) {
      console.warn("Failed to fetch user settings for AI model:", e)
    }

    const analysis = await aiClient.analyzeResults(question, results, query, activeModel)
    return c.json({ analysis })
  } catch (error) {
    console.error("AI Analysis Error:", error)
    return c.json({ error: error.message }, 500)
  }
})

app.post("/ai/spreadsheet-command", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { command, data, headers } = await c.req.json()

    // Fetch user settings to get active model
    let activeModel = null
    try {
      const settingsRes = await db.execute({
        sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
        args: { userId }
      })
      if (settingsRes.rows.length > 0) {
        const settings = JSON.parse(settingsRes.rows[0].settings)
        activeModel = settings.activeModel
      }
    } catch (e) {
      console.warn("Failed to fetch user settings for AI model:", e)
    }

    // Generate prompt for AI
    const prompt = `You are a spreadsheet assistant. The user has a spreadsheet with the following structure:

Headers: ${JSON.stringify(headers)}
Sample Data (first 5 rows): ${JSON.stringify(data.slice(0, 5), null, 2)}

The user wants to: "${command}"

Generate a JSON array of modifications to apply. Each modification should have:
- row: the row number (0 = headers, 1+ = data rows)
- col: the column index (0-based)
- value: the new value for that cell

Return ONLY a valid JSON object with this structure:
{
  "modifications": [
    { "row": 1, "col": 2, "value": "new value" }
  ]
}

Be precise and only modify the cells that need to change based on the command.`

    const response = await aiClient.chat(prompt, [], activeModel)

    // Parse the AI response
    let modifications = []
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        modifications = parsed.modifications || []
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e)
      return c.json({ error: "AI returned invalid response" }, 500)
    }

    return c.json({ modifications })
  } catch (error) {
    console.error("AI Spreadsheet Command Error:", error)
    return c.json({ error: error.message }, 500)
  }
})

app.post("/ai/sanitize/analyze", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { table, connectionId } = await c.req.json()

    console.log("[Sanitize] Starting analysis for:", { table, connectionId, userId })

    // 1. Fetch connection details
    const rs = await db.execute({
      sql: "SELECT * FROM connections WHERE id = $id AND user_id = $userId",
      args: { id: connectionId, userId }
    })
    const connRow = rs.rows[0]
    if (!connRow) {
      console.error("[Sanitize] Connection not found:", { connectionId, userId })
      return c.json({ error: "Connection not found" }, 404)
    }

    const config = JSON.parse(connRow.config)
    const provider = connRow.provider
    console.log("[Sanitize] Using provider:", provider)

    const Adapter = adapters[provider]
    if (!Adapter) {
      console.error("[Sanitize] Provider not supported:", provider)
      return c.json({ error: "Provider not supported" }, 400)
    }

    const adapter = new Adapter(config[provider])
    console.log("[Sanitize] Connecting to database...")
    await adapter.connect()

    // 2. Fetch all data (or sample) from the table
    // For now we fetch all, limiting to 2000 rows for safety
    // Properly quote table name for SQLite (handles spaces and special chars)
    const quotedTable = provider === 'sqlite' ? `"${table}"` : table
    console.log("[Sanitize] Executing query for table:", quotedTable)
    const rows = await adapter.query(`SELECT * FROM ${quotedTable} LIMIT 2000`)
    await adapter.disconnect()

    console.log("[Sanitize] Fetched rows:", rows.length)

    if (rows.length === 0) {
      return c.json({ issues: [], message: "No data found in table" })
    }

    // 3. Analyze
    // Fetch user settings to get active model
    let activeModel = null
    try {
      const settingsRes = await db.execute({
        sql: "SELECT settings FROM user_settings WHERE user_id = $userId",
        args: { userId }
      })
      if (settingsRes.rows.length > 0) {
        const settings = JSON.parse(settingsRes.rows[0].settings)
        activeModel = settings.activeModel
      }
    } catch (e) {
      console.warn("[Sanitize] Could not fetch user settings:", e.message)
    }

    console.log("[Sanitize] Analyzing with model:", activeModel || "default")
    const result = await analyzeForSanitization(table, rows, activeModel)
    console.log("[Sanitize] Analysis complete, found issues:", result.issues?.length || 0)
    return c.json(result)

  } catch (error) {
    console.error("[Sanitize] Analysis Error:", error)
    console.error("[Sanitize] Error stack:", error.stack)
    console.error("[Sanitize] Error details:", {
      message: error.message,
      name: error.name,
      cause: error.cause
    })
    return c.json({ error: error.message || "Failed to analyze table" }, 500)
  }
})

app.get("/ai/models", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const allModels = []

    // Get models from AI Client (handles both Gemini and OpenAI)
    try {
      const models = await aiClient.listModels()
      allModels.push(...models)
    } catch (e) {
      console.error('Failed to fetch AI models:', e)
    }

    return c.json(allModels)
  } catch (error) {
    console.error("Error fetching AI models:", error)
    return c.json({ error: error.message }, 500)
  }
})

app.post("/ai/search", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { term, connectionId } = await c.req.json()

    // 1. Fetch connection
    const rs = await db.execute({
      sql: "SELECT * FROM connections WHERE id = $id AND user_id = $userId",
      args: { id: connectionId, userId }
    })
    const connRow = rs.rows[0]
    if (!connRow) return c.json({ error: "Connection not found" }, 404)

    const config = JSON.parse(connRow.config)
    const provider = connRow.provider
    const Adapter = adapters[provider]
    if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

    const adapter = new Adapter(config[provider])

    let candidates = []
    try {
      await adapter.connect()
      const tables = await adapter.listCollections()
      // Simple fuzzy search
      candidates = tables.filter(t => t.toLowerCase().includes(term.toLowerCase()))
    } finally {
      try { await adapter.disconnect() } catch (e) { }
    }

    // 2. Apply Logic
    if (candidates.length > 50) {
      return c.json({
        status: "too_broad",
        message: "Too many matches found. Please be more specific.",
        count: candidates.length
      })
    }

    if (candidates.length > 8) {
      return c.json({
        status: "ambiguous",
        message: "Multiple matches found. Please refine your search.",
        candidates: candidates.slice(0, 20) // Return top 20 for context if needed
      })
    }

    // 3. If small number, maybe use AI to rank/disambiguate further? 
    // For now, just return them.
    return c.json({
      status: "ok",
      candidates
    })

  } catch (error) {
    console.error("AI Search Error:", error)
    return c.json({ error: error.message }, 500)
  }
})

// Queries Routes
app.get("/queries", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const rs = await db.execute({
      sql: "SELECT * FROM queries WHERE user_id = $userId ORDER BY created_at DESC LIMIT 50",
      args: { userId }
    })
    const queries = rs.rows

    // Map to frontend expected format
    const mapped = queries.map(q => ({
      id: q.id,
      query: q.query,
      timestamp: q.created_at * 1000,
      source: q.source,
      model: q.model,
      status: q.status,
      connection_id: q.connection_id
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

    const id = crypto.randomUUID()
    await db.execute({
      sql: "INSERT INTO queries (id, user_id, query, source, model, status, connection_id, tokens_used) VALUES ($id, $userId, $query, $source, $model, $status, $connectionId, $tokensUsed)",
      args: {
        id,
        userId,
        query,
        source: source || 'user',
        model: model || null,
        status: status || 'success',
        connectionId: connection_id || null,
        tokensUsed: tokens_used || 0
      }
    })

    return c.json({ id })
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

app.post("/api/rename-table", async (c) => {
  try {
    const { connection, oldTableName, newTableName, provider } = await c.req.json()

    console.log(`[Rename] Received rename request:`, {
      oldTableName,
      newTableName,
      provider
    })
    console.log('[Rename] Connection object:', JSON.stringify(connection, null, 2))

    // Verify user session with JWT
    const token = getCookie(c, "session")
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    let userId = null
    try {
      const payload = await verify(token, jwtSecret)
      userId = payload.sub
    } catch (e) {
      return c.json({ error: "Invalid session" }, 401)
    }

    console.log('[Rename] Verified user:', userId)

    // For SQLite/Turso uploads, verify ownership and get correct connection
    let actualConnection = connection
    let extractedUploadId = null
    const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url
    if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
      // UUID in table name uses underscores, but in DB it uses hyphens
      // Match UUID with underscores: 8-4-4-4-12 hex chars separated by underscores
      const uuidMatch = oldTableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
      const uuidWithUnderscores = uuidMatch ? uuidMatch[1] : null;

      const uploadId = uuidWithUnderscores ? uuidWithUnderscores.replace(/_/g, '-') : null;
      extractedUploadId = uploadId

      console.log('[Rename] Extracted Upload ID:', uploadId);

      if (uploadId) {
        // Query uploads table directly using SQL
        const result = await uploadsDb.execute({
          sql: "SELECT * FROM uploads WHERE id = ?",
          args: [uploadId]
        })
        const upload = result.rows[0]

        if (!upload || upload.user_id !== userId) {
          // Debugging: List all uploads for this user to see what exists
          const allUploads = await uploadsDb.execute({
            sql: "SELECT id, filename, created_at FROM uploads WHERE user_id = ?",
            args: [userId]
          });

          console.log('[Rename] Upload check failed details:', {
            targetID: uploadId,
            foundUpload: upload,
            currentUserId: userId,
            userUploads: allUploads.rows.map(u => ({ id: u.id, filename: u.filename }))
          });

          console.error('[Rename] Upload not found or unauthorized')
          return c.json({ error: 'Unauthorized to rename this table' }, 403)
        }

        // Reconstruct the Turso connection from environment
        // SQLiteAdapter expects the config object directly, so we flatten it
        actualConnection = {
          path: process.env.TURSO_UPLOAD_DB_URL,
          authToken: process.env.TURSO_UPLOAD_TOKEN
        }
        console.log('[Rename] Using Turso uploads connection:', JSON.stringify(actualConnection, null, 2))
      }
    }

    const Adapter = adapters[provider]
    if (!Adapter) {
      return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    const adapter = new Adapter(actualConnection)

    try {
      await adapter.connect()
      console.log('[Rename] Adapter connected successfully')

      // Execute ALTER TABLE RENAME TO
      const sql = `ALTER TABLE "${oldTableName}" RENAME TO "${newTableName}"`
      console.log('[Rename] Executing SQL:', sql)

      await adapter.query(sql)

      console.log('[Rename] Table renamed successfully')

      // Update persistently saved connection if exists
      if (connection.id) {
        try {
          const connRows = await db.execute({ sql: "SELECT * FROM connections WHERE id = ?", args: [connection.id] })
          const connRow = connRows.rows[0]

          if (connRow) {
            const config = JSON.parse(connRow.config)

            // Upgrade to robust 'uploadId' linking if available
            if (extractedUploadId) {
              config.sqlite.uploadId = extractedUploadId
              // We can remove the static tables list since we now search dynamically
              if (config.sqlite.tables) delete config.sqlite.tables

              console.log('[Rename] Upgrading connection to use uploadId:', extractedUploadId)

              await db.execute({
                sql: "UPDATE connections SET config = ? WHERE id = ?",
                args: [JSON.stringify(config), connection.id]
              })
              console.log('[Rename] Updated persistent connection config with uploadId')
            }
            // Fallback for legacy connections without uploadId (shouldn't happen for Turso uploads ideally)
            else if (config.sqlite && Array.isArray(config.sqlite.tables)) {
              // Update tables list
              const idx = config.sqlite.tables.indexOf(oldTableName)
              if (idx !== -1) {
                config.sqlite.tables[idx] = newTableName
                // Save back
                await db.execute({
                  sql: "UPDATE connections SET config = ? WHERE id = ?",
                  args: [JSON.stringify(config), connection.id]
                })
                console.log('[Rename] Updated persistent connection config (legacy list)')
              }
            }
          }
        } catch (e) {
          console.error('[Rename] Failed to update persistent connection:', e)
          // Don't fail the request, just log it
        }
      }

      await adapter.disconnect()

      return c.json({ ok: true })
    } catch (error) {
      console.error('[Rename] Error:', error)
      await adapter.disconnect().catch(() => { })

      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to rename table'
      if (errorMessage.includes('no such table')) {
        errorMessage = 'Table not found. It may have already been renamed or deleted.'
      }

      return c.json({ error: errorMessage }, 500)
    }
  } catch (error) {
    console.error('[Rename] Request error:', error)
    return c.json({ error: error.message || 'Internal server error' }, 500)
  }
})

app.post("/api/delete-table", async (c) => {
  try {
    const { connection, tableName, provider } = await c.req.json()

    console.log(`[Delete] Received delete request:`, {
      tableName,
      provider
    })

    // Verify user session with JWT
    const token = getCookie(c, "session")
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    let userId = null
    try {
      const payload = await verify(token, jwtSecret)
      userId = payload.sub
    } catch (e) {
      return c.json({ error: "Invalid session" }, 401)
    }

    console.log('[Delete] Verified user:', userId)

    // For SQLite/Turso uploads, verify ownership and get correct connection
    let actualConnection = connection
    const tursoPath = connection?.sqlite?.path || connection?.sqlite?.url
    if (provider === 'sqlite' && tursoPath?.includes('turso.io')) {
      // UUID in table name uses underscores, but in DB it uses hyphens
      const uuidMatch = tableName.match(/data_([a-f0-9]{8}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{4}_[a-f0-9]{12})_/);
      const uuidWithUnderscores = uuidMatch ? uuidMatch[1] : null;

      const uploadId = uuidWithUnderscores ? uuidWithUnderscores.replace(/_/g, '-') : null;

      if (uploadId) {
        // Query uploads table directly using SQL
        const result = await uploadsDb.execute({
          sql: "SELECT * FROM uploads WHERE id = ?",
          args: [uploadId]
        })
        const upload = result.rows[0]

        if (!upload || upload.user_id !== userId) {
          console.error('[Delete] Upload not found or unauthorized')
          return c.json({ error: 'Unauthorized to delete this table' }, 403)
        }

        // Delete the upload record from the database
        await uploadsDb.execute({
          sql: "DELETE FROM uploads WHERE id = ?",
          args: [uploadId]
        })
        console.log('[Delete] Deleted upload record:', uploadId)

        // Reconstruct the Turso connection from environment
        // SQLiteAdapter expects the config object directly, so we flatten it
        actualConnection = {
          path: process.env.TURSO_UPLOAD_DB_URL,
          authToken: process.env.TURSO_UPLOAD_TOKEN
        }
        console.log('[Delete] Using Turso uploads connection')
      }
    }

    const Adapter = adapters[provider]
    if (!Adapter) {
      return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    const adapter = new Adapter(actualConnection)

    try {
      await adapter.connect()
      console.log('[Delete] Adapter connected successfully')

      // Execute DROP TABLE
      const sql = `DROP TABLE "${tableName}"`
      console.log('[Delete] Executing SQL:', sql)

      await adapter.query(sql)

      console.log('[Delete] Table deleted successfully')

      // Update persistently saved connection if exists
      if (connection.id) {
        try {
          const connRows = await db.execute({ sql: "SELECT * FROM connections WHERE id = ?", args: [connection.id] })
          const connRow = connRows.rows[0]

          if (connRow) {
            const config = JSON.parse(connRow.config)
            if (config.sqlite && Array.isArray(config.sqlite.tables)) {
              // Remove table from list
              const idx = config.sqlite.tables.indexOf(tableName)
              if (idx !== -1) {
                config.sqlite.tables.splice(idx, 1)
                // Save back
                await db.execute({
                  sql: "UPDATE connections SET config = ? WHERE id = ?",
                  args: [JSON.stringify(config), connection.id]
                })
                console.log('[Delete] Updated persistent connection config')
              }
            }
          }
        } catch (e) {
          console.error('[Delete] Failed to update persistent connection:', e)
        }
      }

      await adapter.disconnect()

      return c.json({ ok: true })
    } catch (error) {
      console.error('[Delete] Error:', error)
      await adapter.disconnect().catch(() => { })

      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to delete table'
      if (errorMessage.includes('no such table')) {
        errorMessage = 'Table not found. It may have already been deleted.'
      }

      return c.json({ error: errorMessage }, 500)
    }
  } catch (error) {
    console.error('[Delete] Request error:', error)
    return c.json({ error: error.message || 'Internal server error' }, 500)
  }
})

app.post("/api/save-table-data", async (c) => {
  try {
    const { tableName, updates, deletedRowIds = [], deletedColumns = [], connection, provider } = await c.req.json()
    console.log(`[Save] Received save request:`, {
      tableName,
      updateCount: updates?.length,
      deleteCount: deletedRowIds?.length,
      deletedColumnsCount: deletedColumns?.length,
      provider,
      hasConnection: !!connection
    })

    // Verify user session with JWT
    const token = getCookie(c, "session")
    if (!token) {
      console.error("[Save] No session token found")
      return c.json({ error: "Unauthorized - No session" }, 401)
    }

    let userId
    try {
      const payload = await verify(token, jwtSecret)
      userId = payload.sub
      console.log(`[Save] Verified user: ${userId}`)
    } catch (e) {
      console.error("[Save] Invalid session token:", e.message)
      return c.json({ error: "Unauthorized - Invalid session" }, 401)
    }

    // For uploaded files (SQLite provider with Turso), verify user owns the upload
    if (provider === 'sqlite' && connection?.url?.includes('turso')) {
      console.log('[Save] Verifying upload ownership...')

      // Extract upload ID from table name (format: data_{uploadId}_{sheetName})
      const uploadIdMatch = tableName.match(/^data_([a-f0-9-]+)_/)
      if (uploadIdMatch) {
        const uploadId = uploadIdMatch[1]
        console.log(`[Save] Extracted upload ID: ${uploadId}`)

        try {
          // Verify this upload belongs to the user
          const uploadCheck = await uploadsDb.execute({
            sql: 'SELECT user_id FROM uploads WHERE id = ?',
            args: [uploadId]
          })

          if (uploadCheck.rows.length === 0) {
            console.error(`[Save] Upload ${uploadId} not found`)
            return c.json({ error: "Upload not found" }, 404)
          }

          const uploadUserId = uploadCheck.rows[0].user_id
          if (uploadUserId !== userId) {
            console.error(`[Save] User ${userId} does not own upload ${uploadId} (owner: ${uploadUserId})`)
            return c.json({ error: "Unauthorized - Not your upload" }, 403)
          }

          console.log(`[Save] Upload ownership verified for user ${userId}`)
        } catch (err) {
          console.error('[Save] Error verifying upload ownership:', err)
          return c.json({ error: "Failed to verify upload ownership" }, 500)
        }
      }
    }

    const Adapter = adapters[provider]
    if (!Adapter) {
      console.error(`[Save] Provider '${provider}' not supported`)
      return c.json({ error: `Provider '${provider}' not supported` }, 400)
    }

    console.log('[Save] Creating adapter and connecting...')
    const adapter = new Adapter(connection)

    try {
      await adapter.connect()
      console.log('[Save] Adapter connected successfully')

      let successCount = 0
      const queries = []

      // Process deletions first
      console.log(`[Save] Processing ${deletedRowIds.length} deletions...`)
      console.log(`[Save] Deleted row IDs:`, deletedRowIds)

      const deletedRowIdSet = new Set(deletedRowIds)

      for (const rowid of deletedRowIds) {
        if (rowid !== null && rowid !== undefined && rowid !== '') {
          const sql = `DELETE FROM "${tableName}" WHERE rowid = ${Number(rowid)}`
          queries.push(sql)
          console.log(`[Save] Generated DELETE:`, sql)
        } else {
          console.warn(`[Save] Skipping invalid rowid:`, rowid)
        }
      }

      // Process column deletions
      console.log(`[Save] Processing ${deletedColumns.length} column deletions...`)
      console.log(`[Save] Deleted columns:`, deletedColumns)

      for (const columnName of deletedColumns) {
        if (columnName && columnName !== '_rowid_') {
          const sql = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`
          queries.push(sql)
          console.log(`[Save] Generated ALTER TABLE DROP COLUMN:`, sql)
        } else {
          console.warn(`[Save] Skipping invalid column name:`, columnName)
        }
      }

      console.log(`[Save] Processing ${updates.length} updates...`)
      for (const update of updates) {
        const rowData = update.data
        const originalData = update.original // We need to send this from frontend

        if (!rowData) {
          console.warn('[Save] Skipping update with no data')
          continue
        }

        // Strategy 1: Look for an 'id' column (case-insensitive) to use as Primary Key.
        // Also support SQLite's implicit `_rowid_` if explicitly fetched.
        const idKey = Object.keys(rowData).find(k =>
          k.toLowerCase() === 'id' ||
          k.toLowerCase() === '_id' ||
          k.toLowerCase().endsWith('_id') ||
          k === '_rowid_'
        )

        if (idKey && rowData[idKey] !== undefined && rowData[idKey] !== null) {
          // ... (existing ID logic) ...
          const setClause = Object.keys(rowData)
            .filter(k => k !== idKey) // Don't update the ID itself
            .map(k => {
              const val = rowData[k]
              if (val === null) return `"${k}" = NULL`
              // Escape single quotes by doubling them
              const escapedVal = String(val).replace(/'/g, "''")
              return `"${k}" = '${escapedVal}'`
            })
            .join(', ')

          if (setClause.length > 0) {
            const escapedId = String(rowData[idKey]).replace(/'/g, "''")
            // Quote table name and ID matching
            const sql = `UPDATE "${tableName}" SET ${setClause} WHERE "${idKey}" = '${escapedId}'`
            queries.push(sql)
            console.log(`[Save] Generated UPDATE (ID-based) for ${idKey}=${rowData[idKey]}`)
          }
        }
        // Strategy 2: If no ID, use original data to match the row
        else if (originalData) {
          const setClause = Object.keys(rowData)
            .filter(k => k !== 'undefined' && k !== '_rowid_')
            .map(k => {
              const val = rowData[k]
              if (val === null) return `"${k}" = NULL`
              const escapedVal = String(val).replace(/'/g, "''")
              return `"${k}" = '${escapedVal}'`
            })
            .join(', ')

          const whereClause = Object.keys(originalData)
            .filter(k => {
              // Exclude undefined columns
              if (k === 'undefined') return false
              // Exclude _rowid_ if it's null (row was just inserted and not reloaded)
              if (k === '_rowid_' && originalData[k] === null) return false
              return true
            })
            .map(k => {
              const val = originalData[k]
              if (val === null) return `"${k}" IS NULL`
              const escapedVal = String(val).replace(/'/g, "''")
              return `"${k}" = '${escapedVal}'`
            })
            .join(' AND ')

          if (setClause.length > 0 && whereClause.length > 0) {
            const sql = `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`
            queries.push(sql)
            console.log(`[Save] Generated UPDATE (Content-based):`, sql)
          }
        }
        else {
          // Strategy 3: New Row (INSERT)
          // If we have no ID and no original data, this is likely a new row.
          const insertCols = Object.keys(rowData).filter(k =>
            k !== 'undefined' &&
            k !== '_rowid_' &&
            // Exclude IDs if they are null/empty (assume auto-increment)
            !((k.toLowerCase() === 'id' || k.toLowerCase() === '_id') && (rowData[k] === null || rowData[k] === ''))
          )

          if (insertCols.length > 0) {
            const cols = insertCols.map(k => `"${k}"`).join(', ')
            const values = insertCols.map(k => {
              const val = rowData[k]
              if (val === null) return 'NULL'
              return `'${String(val).replace(/'/g, "''")}'`
            }).join(', ')

            const sql = `INSERT INTO "${tableName}" (${cols}) VALUES (${values})`
            queries.push(sql)
            console.log(`[Save] Generated INSERT:`, sql)
          } else {
            console.warn(`[Save] Verified empty/invalid row ignored`)
          }
        }
      }

      if (queries.length > 0) {
        console.log(`[Save] Executing ${queries.length} SQL queries...`)
        if (adapter.batch) {
          console.log(`[Save] Using batch execution`)
          const batchResult = await adapter.batch(queries)

          if (Array.isArray(batchResult)) {
            // Local libSQL returns array of results
            successCount = batchResult.reduce((sum, res) => sum + (res.rowsAffected || 0), 0)
          } else {
            // Remote/Custom returns object with count
            successCount = batchResult.count || batchResult.affectedRows || 0
          }
        } else {
          console.log(`[Save] Using serial execution`)
          // Fallback to serial execution
          for (const sql of queries) {
            await adapter.query(sql)
            successCount++
          }
        }
      } else {
        console.warn('[Save] No queries generated - nothing to save')
      }

      console.log(`[Save] Successfully saved ${successCount}/${updates.length} rows to ${tableName}`)
      return c.json({ ok: true, saved: successCount })

    } catch (err) {
      console.error("[Save] Database error:", err)
      return c.json({ error: err.message }, 500)
    } finally {
      await adapter.disconnect()
      console.log('[Save] Adapter disconnected')
    }
  } catch (e) {
    console.error("[Save] API Error:", e)
    return c.json({ error: "Internal Server Error" }, 500)
  }
})

// === New Table API Routes ===

// 1. Fetch Table Schema
app.post("/api/table/:tableName/schema", async (c) => {
  try {
    const tableName = c.req.param("tableName")
    const { connection, provider } = await c.req.json()

    // Verify Auth
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

    const Adapter = adapters[provider]
    if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

    const adapter = new Adapter(connection)
    try {
      await adapter.connect()
      const fullSchema = await adapter.getSchema()
      await adapter.disconnect()

      const columns = fullSchema[tableName] || []
      return c.json({ columns })
    } catch (e) {
      return c.json({ error: e.message }, 500)
    }
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// 2. Fetch Table Data (with hidden ID)
app.post("/api/table/:tableName/query", async (c) => {
  try {
    const tableName = c.req.param("tableName")
    const { connection, provider, limit = 100, offset = 0 } = await c.req.json()

    // Verify Auth
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    try { await verify(token, jwtSecret) } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

    const Adapter = adapters[provider]
    if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

    const adapter = new Adapter(connection)
    try {
      await adapter.connect()
      // Select rowid as __id. Quote tableName.
      const sql = `SELECT rowid as __id, * FROM "${tableName}" LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
      const rows = await adapter.query(sql)
      await adapter.disconnect()

      return c.json({ rows: Array.isArray(rows) ? rows : [] })
    } catch (e) {
      return c.json({ error: e.message }, 500)
    }
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})

// 3. Atomic Operations
app.post("/api/table/:tableName/operations", async (c) => {
  try {
    const tableName = c.req.param("tableName")
    const { connection, provider, operations } = await c.req.json()

    // Verify Auth
    const token = getCookie(c, "session")
    if (!token) return c.json({ error: "Unauthorized" }, 401)
    let userId;
    try {
      const payload = await verify(token, jwtSecret)
      userId = payload.sub
    } catch (e) { return c.json({ error: "Unauthorized" }, 401) }

    // Verify Upload Ownership (for Turso)
    if (provider === 'sqlite' && connection?.url?.includes('turso')) {
      const uploadIdMatch = tableName.match(/^data_([a-f0-9-]+)_/) || tableName.match(/^data_([a-f0-9_]+)_/)
      if (uploadIdMatch) {
        const uploadId = uploadIdMatch[1].replace(/_/g, '-')
        try {
          const uploadCheck = await uploadsDb.execute({
            sql: 'SELECT user_id FROM uploads WHERE id = ?',
            args: [uploadId]
          })
          if (uploadCheck.rows.length === 0 || uploadCheck.rows[0].user_id !== userId) {
            return c.json({ error: "Unauthorized - Not your upload" }, 403)
          }
        } catch (e) { console.error('Upload verify failed', e) }
      }
    }

    const Adapter = adapters[provider]
    if (!Adapter) return c.json({ error: "Provider not supported" }, 400)

    const adapter = new Adapter(connection)
    try {
      await adapter.connect()
      const queries = []

      for (const op of operations) {
        if (op.type === 'update') {
          // op.id is the rowid (__id)
          const setClause = Object.keys(op.changes).map(k => {
            const val = op.changes[k]
            if (val === null) return `"${k}" = NULL`
            return `"${k}" = '${String(val).replace(/'/g, "''")}'`
          }).join(', ')

          if (setClause) {
            queries.push(`UPDATE "${tableName}" SET ${setClause} WHERE rowid = ${Number(op.id)}`)
          }
        }
        else if (op.type === 'delete') {
          queries.push(`DELETE FROM "${tableName}" WHERE rowid = ${Number(op.id)}`)
        }
        else if (op.type === 'create') {
          const keys = Object.keys(op.data)
          const cols = keys.map(k => `"${k}"`).join(', ')
          const vals = keys.map(k => {
            const val = op.data[k]
            if (val === null) return 'NULL'
            return `'${String(val).replace(/'/g, "''")}'`
          }).join(', ')
          queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`)
        }
        else if (op.type === 'drop_column') {
          queries.push(`ALTER TABLE "${tableName}" DROP COLUMN "${op.column}"`)
        }
        else if (op.type === 'add_column') {
          queries.push(`ALTER TABLE "${tableName}" ADD COLUMN "${op.column}" TEXT`)
        }
        else if (op.type === 'full_replacement') {
          // Full table replacement: DELETE all rows, then INSERT new data in batches
          console.log(`[Operations] Full replacement for ${tableName}, ${op.rows?.length || 0} rows`)

          // Step 1: Delete all existing data
          queries.push(`DELETE FROM "${tableName}"`)

          // Step 2: Insert new data in batches of 1000 rows
          const rows = op.rows || []
          const batchSize = 1000

          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize)

            for (const row of batch) {
              const keys = Object.keys(row)
              if (keys.length === 0) continue

              const cols = keys.map(k => `"${k}"`).join(', ')
              const vals = keys.map(k => {
                const val = row[k]
                if (val === null || val === undefined) return 'NULL'
                return `'${String(val).replace(/'/g, "''")}'`
              }).join(', ')

              queries.push(`INSERT INTO "${tableName}" (${cols}) VALUES (${vals})`)
            }
          }

          console.log(`[Operations] Generated ${queries.length} queries for full replacement`)
        }
        else if (op.type === 'cleanup_empty') {
          // Delete rows where all non-rowid columns are NULL or empty
          // Get column names first (excluding rowid)
          const schemaResult = await adapter.query(`PRAGMA table_info("${tableName}")`)
          const columns = schemaResult.map(col => col.name).filter(name => name !== 'rowid')

          if (columns.length > 0) {
            // Build WHERE clause: all columns must be NULL or empty
            const conditions = columns.map(col => `("${col}" IS NULL OR "${col}" = '')`).join(' AND ')
            queries.push(`DELETE FROM "${tableName}" WHERE ${conditions}`)
          }
        }
      }

      if (queries.length > 0) {
        if (adapter.batch) {
          await adapter.batch(queries)
        } else {
          for (const q of queries) await adapter.query(q)
        }
      }

      await adapter.disconnect()
      return c.json({ success: true, count: queries.length })
    } catch (e) {
      return c.json({ error: e.message }, 500)
    }
  } catch (e) {
    return c.json({ error: e.message }, 500)
  }
})


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

import { serve } from '@hono/node-server'

const port = 3000
console.log(`Pegasus query gateway running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
