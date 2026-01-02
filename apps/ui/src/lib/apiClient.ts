/**
 * Centralized API Client
 * 
 * Provides a type-safe, consistent interface for all API calls.
 * Automatically handles:
 * - Authentication headers (JWT from localStorage)
 * - CORS credentials
 * - Error handling
 * - Request/response logging
 */

const DEFAULT_QUERY_API_URL = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : 'http://localhost:3000'

const derivedApiUrl = import.meta.env.VITE_QUERY_API_URL ||
    (typeof window !== 'undefined'
        ? (window as Window & { __QUERY_API_URL__?: string }).__QUERY_API_URL__
        : undefined) || DEFAULT_QUERY_API_URL

export const QUERY_API_URL = derivedApiUrl

interface RequestOptions {
    headers?: HeadersInit
    body?: unknown
    credentials?: RequestCredentials
    skipAuthRedirect?: boolean
}

class ApiClient {
    private baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    /**
     * Get headers with automatic auth token injection
     */
    private getHeaders(customHeaders?: HeadersInit): HeadersInit {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(customHeaders as Record<string, string> || {})
        }

        // Add Authorization header if we have a token in localStorage
        const token = localStorage.getItem('auth_token')
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }

        return headers
    }

    /**
     * Generic request method
     */
    private async request<T>(
        method: string,
        path: string,
        options?: RequestOptions
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`

        const headers = this.getHeaders(options?.headers)

        const config: RequestInit = {
            method,
            headers,
            credentials: options?.credentials || 'include',
        }

        if (options?.body) {
            config.body = JSON.stringify(options.body)
        }

        const response = await fetch(url, config)

        // Handle unauthorized responses centrally
        if (response.status === 401) {
            if (options?.skipAuthRedirect) {
                throw new Error('Unauthorized')
            }

            console.warn('[ApiClient] Unauthorized (401). Clearing token and redirecting to login.')
            localStorage.removeItem('auth_token')
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
                window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
            }
            throw new Error('Unauthorized')
        }

        // Handle other non-OK responses
        if (!response.ok) {
            const errorText = await response.text()
            let errorMessage = `${method} ${path} failed: ${response.status}`

            try {
                const errorJson = JSON.parse(errorText)
                errorMessage = errorJson.error || errorMessage
            } catch {
                // If not JSON, use the text or status
                errorMessage = errorText || errorMessage
            }

            throw new Error(errorMessage)
        }

        // Handle empty responses (204 No Content, etc.)
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
            return {} as T
        }

        return response.json()
    }

    /**
     * GET request
     */
    async get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T> {
        return this.request<T>('GET', path, options)
    }

    /**
     * POST request
     */
    async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
        return this.request<T>('POST', path, { ...options, body })
    }

    /**
     * PUT request
     */
    async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
        return this.request<T>('PUT', path, { ...options, body })
    }

    /**
     * DELETE request
     */
    async delete<T>(path: string, options?: RequestOptions): Promise<T> {
        return this.request<T>('DELETE', path, options)
    }

    /**
     * Upload file (multipart/form-data)
     */
    async upload<T>(path: string, formData: FormData): Promise<T> {
        const url = `${this.baseUrl}${path}`

        // Get auth headers but remove Content-Type (let browser set it with boundary)
        const headers = this.getHeaders()
        delete (headers as Record<string, string>)['Content-Type']

        const response = await fetch(url, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: formData
        })

        if (!response.ok) {
            throw new Error(`Upload ${path} failed: ${response.status}`)
        }

        return response.json()
    }
}

// Export singleton instance
export const api = new ApiClient(QUERY_API_URL)

// Export helper for getting auth headers (for backwards compatibility)
export function getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    }

    const token = localStorage.getItem('auth_token')
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    return headers
}
