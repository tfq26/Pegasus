import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'
import { logOperation, getUserOperations, getOperationAnalytics } from '../services/operations.js'

const operations = new Hono()

const jwtSecret = process.env.JWT_SECRET || "fallback_secret_do_not_use_in_production"

// Helper to get userId from session
const getUserId = async (c) => {
    const token = getCookie(c, "session")
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const verified = (await verify(authHeader.substring(7), jwtSecret))
                return verified.sub
            } catch (e) {
                return null
            }
        }
        return null
    }
    try {
        const payload = (await verify(token, jwtSecret))
        return payload.sub
    } catch (e) {
        return null
    }
}

// Log or update an operation
operations.post('/', async (c) => {
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

// Log a batch of operations
operations.post('/batch', async (c) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    try {
        const { operations: ops } = await c.req.json()
        if (!Array.isArray(ops)) return c.json({ error: 'Invalid batch format' }, 400)

        // Process batch (sequentially for simplicity, or parallel)
        let count = 0;
        for (const op of ops) {
            try {
                await logOperation({
                    ...op,
                    user_id: String(userId)
                })
                count++
            } catch (err) {
                console.warn('Failed to log operation in batch:', err)
            }
        }
        return c.json({ success: true, count })
    } catch (error) {
        console.error('Error logging batch:', error)
        return c.json({ error: 'Failed to log batch' }, 500)
    }
})

// Get user operation history
operations.get('/history', async (c) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    const limitStr = c.req.query('limit') || '50'
    const limit = parseInt(limitStr)

    try {
        const history = await getUserOperations(String(userId), limit)
        return c.json(history)
    } catch (error) {
        console.error('Error fetching operation history:', error)
        return c.json({ error: 'Failed to fetch history' }, 500)
    }
})

// Get performance analytics
operations.get('/analytics', async (c) => {
    const userId = await getUserId(c)
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)

    const range = c.req.query('range') || 'day'

    try {
        const analytics = await getOperationAnalytics(String(userId), range)
        return c.json(analytics)
    } catch (error) {
        console.error('Error fetching operation analytics:', error)
        return c.json({ error: 'Failed to fetch analytics' }, 500)
    }
})

export { operations as operationRoutes }
