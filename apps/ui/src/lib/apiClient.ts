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
    signal?: AbortSignal
}

export class ApiClient {
    private baseUrl: string

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl
    }

    getBaseUrl(): string {
        return this.baseUrl
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
            signal: options?.signal
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

            console.warn('[ApiClient] Unauthorized (401). Clearing state and redirecting to login.')

            // 1. Clear tokens
            localStorage.removeItem('auth_token')
            sessionStorage.clear()

            // 2. Notify other services (IdentityService) to purge state
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('pegasus:unauthorized'))

                // 3. Redirect to login
                if (!window.location.pathname.startsWith('/login')) {
                    const currentPath = window.location.pathname + window.location.search
                    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
                }
            }

            throw new Error('Unauthorized')
        }

        // Handle other non-OK responses
        if (!response.ok) {
            const errorText = await response.text()
            let errorMessage = `${method} ${path} failed: ${response.status}`
            let errorData = null

            try {
                errorData = JSON.parse(errorText)
                errorMessage = errorData.error || errorMessage
            } catch {
                // If not JSON, use the text or status
                errorMessage = errorText || errorMessage
            }

            const error = new Error(errorMessage) as any
            error.status = response.status
            error.data = errorData
            error.response = response // For advanced cases
            throw error
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
    /**
     * STREAM request (NDJSON)
     */
    async stream<T>(
        path: string,
        body: unknown,
        onChunk: (chunk: T) => void,
        options?: RequestOptions
    ): Promise<void> {
        const url = `${this.baseUrl}${path}`
        const headers = this.getHeaders(options?.headers)

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: options?.signal
        })

        if (response.status === 401) {
            console.warn('[ApiClient] Unauthorized (401). Redirecting.')
            localStorage.removeItem('auth_token')
            window.location.href = '/login'
            throw new Error('Unauthorized')
        }

        if (!response.ok) {
            const errorText = await response.text()
            let errorMessage = `Stream failed: ${response.status}`
            try {
                const errorJson = JSON.parse(errorText)
                errorMessage = errorJson.error || errorMessage
            } catch { }
            throw new Error(errorMessage)
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            throw new Error(`Stream request returned HTML content (Status ${response.status}). Expected JSON/Stream.`);
        }

        const reader = response.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''

        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')

                // Keep the last partial line in the buffer
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            if (line.trim() === '{}') {
                                // console.warn('[ApiClient] Skipping empty object chunk'); 
                                continue;
                            }
                            const chunk = JSON.parse(line)
                            onChunk(chunk)
                        } catch (e) {
                            console.error('[ApiClient] Stream Parse Error:', e)
                            console.error('[ApiClient] Raw Invalid Chunk Content:', line)

                            // If we receive HTML (e.g. from Vercel timeout), strictly throw
                            const trimmed = line.trim();
                            if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
                                throw new Error('Received HTML error page (likely 500/504) instead of JSON stream.')
                            }
                            // If plain text error
                            if (!line.startsWith('{') && !line.startsWith('[')) {
                                console.warn('[ApiClient] Received plain text chunk:', line);
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock()
        }
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
