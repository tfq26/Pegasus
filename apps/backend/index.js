import { Hono } from "hono"
import { cors } from "hono/cors"
import { adapters } from "./adapters/index.js"

const app = new Hono()
app.use("*", cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"]
}))

import { WorkOS } from "@workos-inc/node"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import { sign, verify } from "hono/jwt"

import { Database } from "bun:sqlite"
import { db } from "../db/index.ts"

const workos = new WorkOS(process.env.WORKOS_API_KEY)
const clientId = process.env.WORKOS_CLIENT_ID
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"
const redirectUri = process.env.WORKOS_REDIRECT_URI || "http://localhost:3000/auth/callback"

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
    const { user } = await workos.userManagement.authenticateWithCode({
      code,
      clientId,
    })

    console.log("WorkOS User Object:", JSON.stringify(user, null, 2))

    // Upsert user into SQLite
    const upsertUser = db.prepare(`
      INSERT INTO users (id, email, first_name, last_name, profile_picture_url)
      VALUES ($id, $email, $firstName, $lastName, $profilePictureUrl)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        profile_picture_url = excluded.profile_picture_url
    `)

    upsertUser.run({
      $id: user.id,
      $email: user.email,
      $firstName: user.firstName,
      $lastName: user.lastName,
      $profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null
    })

    const payload = {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePictureUrl: user.profile_picture_url || user.profilePictureUrl || null,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    }

    console.log("JWT Payload:", JSON.stringify(payload, null, 2))

    const token = await sign(payload, jwtSecret)

    setCookie(c, "session", token, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    })

    return c.redirect("http://localhost:5173")
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
    return c.json({ user: payload })
  } catch (error) {
    return c.json({ user: null })
  }
})

app.get("/auth/logout", (c) => {
  deleteCookie(c, "session")
  return c.redirect("http://localhost:5173")
})

// Dashboard Endpoints
app.get("/dashboard", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const result = db.query("SELECT layout FROM dashboards WHERE user_id = $userId").get({ $userId: userId })

    if (result && result.layout) {
      return c.json({ layout: JSON.parse(result.layout) })
    }

    return c.json({ layout: null })
  } catch (error) {
    return c.json({ error: "Unauthorized" }, 401)
  }
})

app.post("/dashboard", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const { layout } = await c.req.json()

    const upsertDashboard = db.prepare(`
      INSERT INTO dashboards (user_id, layout, updated_at)
      VALUES ($userId, $layout, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        layout = excluded.layout,
        updated_at = unixepoch()
    `)

    upsertDashboard.run({
      $userId: userId,
      $layout: JSON.stringify(layout)
    })

    return c.json({ ok: true })
  } catch (error) {
    console.error("Dashboard save error:", error)
    return c.json({ error: "Failed to save" }, 500)
  }
})

// Connections Endpoints
app.get("/connections", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub

    const results = db.query("SELECT * FROM connections WHERE user_id = $userId ORDER BY created_at ASC").all({ $userId: userId })

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

    // Extract config based on provider
    let config = {}
    if (connection.provider === 'mysql') config = { mysql: connection.mysql }
    else if (connection.provider === 'mongodb') config = { mongodb: connection.mongodb }
    else if (connection.provider === 'kusto') config = { kusto: connection.kusto }

    const insertConnection = db.prepare(`
      INSERT INTO connections (id, user_id, nickname, description, provider, config, created_at)
      VALUES ($id, $userId, $nickname, $description, $provider, $config, unixepoch())
    `)

    insertConnection.run({
      $id: connection.id || crypto.randomUUID(),
      $userId: userId,
      $nickname: connection.nickname,
      $description: connection.description,
      $provider: connection.provider,
      $config: JSON.stringify(config)
    })

    return c.json({ ok: true })
  } catch (error) {
    console.error("Connection save error:", error)
    return c.json({ error: "Failed to save connection" }, 500)
  }
})

app.delete("/connections/:id", async (c) => {
  const token = getCookie(c, "session")
  if (!token) return c.json({ error: "Unauthorized" }, 401)

  try {
    const payload = await verify(token, jwtSecret)
    const userId = payload.sub
    const connectionId = c.req.param("id")

    const deleteConnection = db.prepare("DELETE FROM connections WHERE id = $id AND user_id = $userId")
    deleteConnection.run({ $id: connectionId, $userId: userId })

    return c.json({ ok: true })
  } catch (error) {
    return c.json({ error: "Failed to delete connection" }, 500)
  }
})

app.post("/query", async (c) => {
  const { provider, connection, query } = await c.req.json()

  const Adapter = adapters[provider]

  if (!Adapter) {
    return c.json({ error: `Provider '${provider}' not supported` }, 400)
  }

  const adapter = new Adapter(connection)

  try {
    await adapter.connect()
    const result = await adapter.query(query)
    return c.json({ ok: true, result })
  } catch (err) {
    return c.json({ error: err.message }, 500)
  } finally {
    await adapter.disconnect()
  }
})

app.post("/schema", async (c) => {
  const { provider, connection } = await c.req.json()

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
})

Bun.serve({
  port: 3000,
  fetch: app.fetch
})

console.log("Pegasus query gateway running on http://localhost:3000")
