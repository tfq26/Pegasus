import { createClient } from "@libsql/client"

const uploadsDbUrl = process.env.TURSO_UPLOAD_DB_URL

if (!uploadsDbUrl) {
  console.warn("[Uploads DB] TURSO_UPLOAD_DB_URL is missing; upload metadata queries will fail if invoked.")
}

export const uploadsDb = createClient({
  url: uploadsDbUrl || "file::memory:",
  authToken: process.env.TURSO_UPLOAD_TOKEN,
})
