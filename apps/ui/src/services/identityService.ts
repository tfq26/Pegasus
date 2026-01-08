import { ref, computed } from 'vue'

export interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
    profilePictureUrl?: string
    subscription_tier?: string
}

class IdentityService {
    private _user = ref<User | null>(null)
    private _isLoading = ref(true)
    private _isOnline = ref(navigator.onLine)
    private _initialized = false

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => { this._isOnline.value = true })
            window.addEventListener('offline', () => { this._isOnline.value = false })
        }
    }

    // Getters
    get user() { return this._user.value }
    get isLoading() { return this._isLoading.value }
    get isOnline() { return this._isOnline.value }
    get isAuthenticated() { return !!this._user.value }

    // Helpers
    isTauri() {
        return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    }

    private getApiUrl() {
        return import.meta.env.VITE_QUERY_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`
    }

    /**
     * Initialize the identity service. 
     * Handles URL tokens and initial user fetch.
     */
    async init() {
        console.log('[IdentityService] init() called, _initialized:', this._initialized)
        if (this._initialized) return
        this._initialized = true

        const token = this.checkUrlToken()
        console.log('[IdentityService] URL token:', token ? 'found' : 'not found')
        await this.fetchUser(token)
    }

    private checkUrlToken() {
        if (typeof window === 'undefined') return null
        const params = new URLSearchParams(window.location.search)
        const token = params.get('token')

        if (token) {
            console.log('[IdentityService] Token found in URL')
            localStorage.setItem('auth_token', token)

            // Clean up URL
            params.delete('token')
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
            window.history.replaceState({}, '', newUrl)
            return token
        }
        return null
    }

    async fetchUser(explicitToken: string | null = null) {
        console.log('[IdentityService] fetchUser() called, explicitToken:', explicitToken ? 'provided' : 'none')
        this._isLoading.value = true

        if (this.isTauri() && !this._isOnline.value) {
            console.log('[IdentityService] Tauri offline - skipping fetch')
            this._isLoading.value = false
            return
        }

        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            const token = explicitToken || localStorage.getItem('auth_token')
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            console.log('[IdentityService] Calling /auth/me...')
            const res = await fetch(`${this.getApiUrl()}/auth/me`, {
                credentials: 'include',
                headers,
                cache: 'no-store'
            })

            if (!res.ok) throw new Error('Failed to fetch user')

            const data = await res.json()
            console.log('[IdentityService] /auth/me response:', data.user ? 'user found' : 'no user')
            this._user.value = data.user

            // Re-store token if provided
            if (data.token) {
                localStorage.setItem('auth_token', data.token)
            }
        } catch (e) {
            console.error('[IdentityService] fetchUser failed:', e)
            this._user.value = null
        } finally {
            this._isLoading.value = false
        }
    }

    async login() {
        const API_URL = this.getApiUrl()

        if (this.isTauri() && !this._isOnline.value) {
            window.location.href = '/local-auth'
            return
        }

        if (this.isTauri()) {
            try {
                const { useDesktopAuth } = await import('@/composables/useDesktopAuth')
                const { loginWithCloud } = useDesktopAuth()
                const result = await loginWithCloud()
                if (result.success && result.user) {
                    this._user.value = result.user
                }
                return
            } catch (e) {
                console.error('[IdentityService] Device flow failed:', e)
                return
            }
        }

        const returnTo = window.location.origin
        window.location.href = `${API_URL}/auth/login?return_to=${encodeURIComponent(returnTo)}`
    }

    async logout() {
        const API_URL = this.getApiUrl()

        if (this.isTauri()) {
            try {
                const { invoke } = await import('@tauri-apps/api/core')
                await invoke('local_logout')
            } catch (e) {
                console.warn('[IdentityService] Tauri local logout failed:', e)
            }
        }

        // Clear local state immediately
        this._user.value = null
        this._initialized = false
        sessionStorage.clear()

        // Use redirect-based logout to ensure the browser processes the Set-Cookie header
        // This avoids race conditions with fetch-based logout
        window.location.href = `${API_URL}/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`
    }
}

export const identityService = new IdentityService()
