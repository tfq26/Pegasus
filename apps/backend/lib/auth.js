import { getCookie } from "hono/cookie"

/**
 * Extracts the authentication token from either a session cookie or the Authorization header.
 * @param {import('hono').Context} c - Hono context
 * @returns {string|null} The token or null
 */
export const getAuthToken = (c) => {
    let token = getCookie(c, "session")
    if (!token) {
        const authHeader = c.req.header("Authorization")
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7)
        }
    }
    return token
}
