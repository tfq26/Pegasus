import { getCookie } from "hono/cookie"

/**
 * Extracts the authentication token from either a session cookie or the Authorization header.
 * @param {import('hono').Context} c - Hono context
 * @returns {string|null} The token or null
 */
export const getAuthToken = (c) => {
    // 1. Primary Source: Authorization Header
    const authHeader = c.req.header("Authorization")
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7)
        if (token && token !== "undefined") return token
    }

    // 2. Secondary/Fallback: Session Cookie (for compatibility/handshakes)
    const cookieToken = getCookie(c, "session")
    if (cookieToken && cookieToken !== "undefined") {
        return cookieToken
    }

    return null
}
