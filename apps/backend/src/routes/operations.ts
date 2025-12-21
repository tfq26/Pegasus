import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import { logOperation, getUserOperations, getOperationAnalytics } from '../services/operations.js'

const operations = new Hono()

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper to get userId from session
const getUserId = async (c: any) => {
    const token = getCookie(c, "session")
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const verified = (await verify(authHeader.substring(7), jwtSecret)) as any
                return verified.sub
            } catch (e) {
                return null
            }
        }
        return null
    }
    try {
        const payload = (await verify(token, jwtSecret)) as any
        return payload.sub
    } catch (e) {
        return null
    }
}

// Log or update an operation
operations.post('/', async (c: any) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    try {
        const data = await c.req.json()
        const result = await logOperation({
            ...data,
            user_id: String(userId)
        })
        return c.json(result)
    } catch (error) {
        console.error('Error logging operation:', error)
        return c.json({ error: 'Failed to log operation' }, 500)
    }
})

// Get user operation history
operations.get('/history', async (c: any) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    const limitStr = c.req.query('limit') || '50'
    const limit = parseInt(limitStr as string)

    try {
        const history = await getUserOperations(String(userId), limit)
        return c.json(history)
    } catch (error) {
        console.error('Error fetching operation history:', error)
        return c.json({ error: 'Failed to fetch history' }, 500)
    }
})

// Get performance analytics
operations.get('/analytics', async (c: any) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    const range = c.req.query('range') || 'day'

    try {
        const analytics = await getOperationAnalytics(String(userId), range as any)
        return c.json(analytics)
    } catch (error) {
        console.error('Error fetching operation analytics:', error)
        return c.json({ error: 'Failed to fetch analytics' }, 500)
    }
})

export { operations as operationRoutes }
