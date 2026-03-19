import { Hono } from "hono"
import { InspectorService } from "../services/InspectorService.js"
import { getAuthToken } from "../../lib/auth.js"
import { verify } from "hono/jwt"
import { ConfigService } from "../services/ConfigService.js"
import { StorageManager } from "../services/storage/StorageManager.js"
import crypto from "node:crypto"

const inspectorRouter = new Hono()
const jwtSecret = ConfigService.getJwtSecret()

inspectorRouter.post("/analyze", async (c) => {
    const token = getAuthToken(c)
    let userId = 'dev_user'
    if (token) {
        try {
            const payload = await verify(token, jwtSecret)
            userId = payload.sub
        } catch (e) { }
    }

    const body = await c.req.parseBody()
    const file = body['file']
    const question = body['question'] || "Analyze this data"

    if (!file || !(file instanceof File)) {
        return c.json({ error: "No file uploaded" }, 400)
    }

    try {
        const storage = await StorageManager.getProvider(userId)
        const fileName = file.name
        const fileBuffer = Buffer.from(await file.arrayBuffer())
        
        // Save to temporary storage for analysis
        const storagePath = `temp/inspector/${userId}/${crypto.randomUUID()}-${fileName}`
        await storage.write(storagePath, fileBuffer)

        // Resolve absolute local path for DuckDB
        const absoluteLocalPath = await StorageManager.getLocalPath(userId, storagePath)
        console.log(`[Inspector Route] Generated absoluteLocalPath: ${absoluteLocalPath}`);

        // The analyze method in InspectorService expects a connectionId or nested config
        // Here we pass a virtual connection config for the ad-hoc file
        const result = await InspectorService.analyze(userId, {
            type: 'duckdb',
            config: { path: absoluteLocalPath }
        }, question)

        return c.json(result)
    } catch (e) {
        console.error("[Inspector Route] Error:", e)
        return c.json({ error: e.message, stack: e.stack }, 500)
    }
})

export default inspectorRouter
