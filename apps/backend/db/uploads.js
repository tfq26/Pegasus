import { createClient } from "@libsql/client"

const url = process.env.TURSO_UPLOAD_DB_URL
const authToken = process.env.TURSO_UPLOAD_TOKEN

if (!url) {
    console.warn("[Uploads DB] TURSO_UPLOAD_DB_URL is not set. Uploads may fail or fallback to main DB.")
}

// Custom DB Client using Fetch for Turso HTTP API (Reused from db/index.js pattern)
// We reuse this pattern to avoid Vercel/Serverless environment issues with native drivers
class CustomTursoClient {
    constructor(config) {
        this.url = config.url
        this.authToken = config.authToken
        this.isLocal = this.url?.startsWith('file:')
    }

    async execute(stmt) {
        if (!this.url) throw new Error("Uploads DB URL not configured")

        // Prepare statement
        let sql, args
        if (typeof stmt === 'string') {
            sql = stmt
            args = []
        } else {
            sql = stmt.sql
            args = stmt.args || []
        }

        // Handle Named Arguments -> Positional Arguments Conversion
        if (args && !Array.isArray(args) && typeof args === 'object') {
            const namedValues = args
            const positionalArgs = []

            sql = sql.replace(/([:@$][a-zA-Z0-9_]+)/g, (match, paramName) => {
                let val = namedValues[paramName]
                if (val === undefined) {
                    const cleanName = paramName.substring(1)
                    val = namedValues[cleanName]
                }
                if (val === undefined) return match
                positionalArgs.push(val)
                return "?"
            })
            args = positionalArgs
        }

        // Construct the HTTP URL
        const httpUrl = this.url.replace("libsql://", "https://") + "/v2/pipeline"

        const requestBody = {
            requests: [
                {
                    type: "execute",
                    stmt: {
                        sql: sql,
                        args: this.formatArgs(args)
                    }
                },
                { type: "close" }
            ]
        }

        const response = await fetch(httpUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            const text = await response.text()
            throw new Error(`Turso Error ${response.status}: ${text}`)
        }

        const data = await response.json()
        const result = data.results[0]

        if (result.type === 'error') {
            throw new Error(`Turso Query Error: ${result.error.message}`)
        }

        return {
            rows: this.parseRows(result.response.result),
            rowsAffected: result.response.result.affected_row_count,
            lastInsertRowid: result.response.result.last_insert_rowid
        }
    }

    formatArgs(args) {
        if (Array.isArray(args)) {
            return args.map(val => this.formatValue(val))
        }
        return []
    }

    formatValue(val) {
        if (val === null) return { type: "null" }
        if (typeof val === 'number') return { type: "float", value: val }
        if (typeof val === 'boolean') return { type: "integer", value: val ? "1" : "0" }
        return { type: "text", value: String(val) }
    }

    parseRows(result) {
        if (!result.cols || !result.rows) return []
        const cols = result.cols.map(c => c.name)
        return result.rows.map(row => {
            const obj = {}
            row.forEach((cell, i) => {
                let val = cell.value
                if (cell.type === 'integer' || cell.type === 'float') val = Number(val)
                obj[cols[i]] = val
            })
            return obj
        })
    }
}

export const uploadsDb = new CustomTursoClient({
    url,
    authToken
})

// Initialize Uploads Metadata Table
const initUploadsDb = async () => {
    if (!url) return

    try {
        console.log("[Uploads DB] Initializing...")
        await uploadsDb.execute(`
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        filename TEXT,
        size INTEGER,
        format TEXT,
        visibility TEXT DEFAULT 'private',
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)
        console.log("[Uploads DB] Initialized")
    } catch (e) {
        console.error("[Uploads DB] Failed to initialize:", e)
    }
}

initUploadsDb()
