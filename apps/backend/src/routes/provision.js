import { Hono } from "hono"
import { getCookie } from "hono/cookie"
import { verify } from "hono/jwt"
import { provisioningService } from "../services/ProvisioningService.js"
import { azureProvisioner } from "../services/AzureProvisioner.js"
import { awsProvisioner } from "../services/AWSProvisioner.js"

const provision = new Hono()
const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

const getAuthToken = (c) => {
    let token = getCookie(c, "session")
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    return token
}

provision.post("/managed", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const payload = await verify(token, jwtSecret)
        const { nickname } = await c.req.json()
        const userId = payload.sub

        const result = await provisioningService.provisionManagedInstance(userId, nickname || 'instance')
        return c.json(result)
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

provision.post("/azure", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { credentials, config } = await c.req.json()
        const result = await azureProvisioner.provisionACI(credentials, config)
        return c.json(result)
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

provision.post("/aws", async (c) => {
    const token = getAuthToken(c)
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    try {
        const { credentials, config } = await c.req.json()
        const result = await awsProvisioner.provisionECS(credentials, config)
        return c.json(result)
    } catch (e) {
        return c.json({ error: e.message }, 500)
    }
})

provision.get("/guides", async (c) => {
    return c.json(provisioningService.getGuides())
})

export { provision as provisionRoutes }
