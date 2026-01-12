import { ref } from 'vue'
import { api } from '@/lib/apiClient'

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
    private _fetchPromise: Promise<void> | null = null

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => { this._isOnline.value = true })
            window.addEventListener('offline', () => { this._isOnline.value = false })

            // Centralized listener for 401s from any service
            window.addEventListener('pegasus:unauthorized', () => {
                console.warn('[IdentityService] pegasus:unauthorized event received')
                this.purgeState()
            })

            // Support Deep Links for browser-based desktop auth
            this.setupDeepLinkListener()
        }
    }

    private async setupDeepLinkListener() {
        if (!this.isTauri()) return;

        try {
            const { listen } = await import('@tauri-apps/api/event');
            listen<string>('deep-link://new-url', (event) => {
                console.log('[IdentityService] Deep link received:', event.payload);
                this.handleDeepLink(event.payload);
            });
        } catch (e) {
            console.error('[IdentityService] Failed to setup deep link listener:', e);
        }
    }

    private handleDeepLink(url: string) {
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'pegasus:' && urlObj.host === 'auth') {
                const token = urlObj.searchParams.get('token');
                const email = urlObj.searchParams.get('email');

                if (token) {
                    console.log('[IdentityService] Token captured from deep link for:', email);
                    localStorage.setItem('auth_token', token);
                    this.fetchUser();
                }
            }
        } catch (e) {
            console.error('[IdentityService] Error parsing deep link:', e);
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

    /**
     * Initialize the identity service. 
     * Handles URL tokens and initial user fetch.
     */
    async init() {
        console.log('[IdentityService] init() called, _initialized:', this._initialized)
        if (this._initialized) return
        this._initialized = true

        this.checkUrlToken()
        await this.fetchUser()
    }

    private checkUrlToken() {
        if (typeof window === 'undefined') return

        // 1. Check top-level search params
        let params = new URLSearchParams(window.location.search)
        let token = params.get('token')

        // 2. If not found, check if it's nested in a redirect param (common with complex redirections)
        if (!token) {
            const redirectParam = params.get('redirect')
            if (redirectParam && redirectParam.includes('token=')) {
                const nestedMatch = redirectParam.match(/[?&]token=([^&]+)/)
                if (nestedMatch && nestedMatch[1]) {
                    token = nestedMatch[1]
                    console.log('[IdentityService] Found nested token in redirect param')
                }
            }
        }

        if (token) {
            console.log('[IdentityService] Token captured, updating storage')
            localStorage.setItem('auth_token', token)

            // Clean up URL: remove token ONLY if it was top-level
            // If it's nested, the whole redirect param might be needed until the next hop
            if (params.has('token')) {
                params.delete('token')
                const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
                window.history.replaceState({}, '', newUrl)
            }
        }
    }

    async fetchUser() {
        if (this._fetchPromise) {
            return this._fetchPromise
        }

        this._fetchPromise = (async () => {
            console.log('[IdentityService] fetchUser() called')
            this._isLoading.value = true

            if (this.isTauri() && !this._isOnline.value) {
                console.log('[IdentityService] Tauri offline - skipping fetch')
                this._isLoading.value = false
                this._fetchPromise = null
                return
            }

            try {
                console.log('[IdentityService] Fetching profile via ApiClient...')
                const data = await api.get<{ user: User; token?: string }>('/auth/me', {
                    skipAuthRedirect: true // Don't redirect if /me fails initial check
                })

                if (data.user) {
                    console.log('[IdentityService] Profile loaded:', data.user.email)
                    this._user.value = data.user

                    // Refresh token if server provided a new one
                    if (data.token) {
                        localStorage.setItem('auth_token', data.token)
                    }
                } else {
                    this._user.value = null
                }
            } catch (e) {
                console.warn('[IdentityService] fetchUser failed or unauthenticated:', (e as Error).message)
                this._user.value = null

                // Clear any stale token that may be causing repeated 401s
                const errorMessage = (e as Error).message
                if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
                    console.log('[IdentityService] Clearing stale auth token')
                    localStorage.removeItem('auth_token')
                }
            } finally {
                this._isLoading.value = false
                this._fetchPromise = null
            }
        })()

        return this._fetchPromise
    }

    async login() {
        const API_URL = api.getBaseUrl()

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

        const returnTo = window.location.href
        window.location.href = `${API_URL}/auth/login?return_to=${encodeURIComponent(returnTo)}`
    }

    /**
     * Centralized state purge.
     * Use this when a session is invalidated (logout or 401).
     */
    purgeState() {
        console.log('[IdentityService] purgeState() - Clearing all local auth state')
        this._user.value = null
        this._initialized = false
        localStorage.removeItem('auth_token')
        sessionStorage.clear()
    }

    async logout() {
        const API_URL = api.getBaseUrl()

        if (this.isTauri()) {
            try {
                const { invoke } = await import('@tauri-apps/api/core')
                await invoke('local_logout')
            } catch (e) {
                console.warn('[IdentityService] Tauri local logout failed:', e)
            }
        }

        this.purgeState()

        // Perform server-side logout to clear cookies
        // Redirect back to home after server-side cleanup
        window.location.href = `${API_URL}/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`
    }
}

export const identityService = new IdentityService()
