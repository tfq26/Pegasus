import { ref } from 'vue'
import { api, authApi } from '@/lib/apiClient'

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
        }
    }

    // Getters
    get user() { return this._user.value }
    get isLoading() { return this._isLoading.value }
    get isOnline() { return this._isOnline.value }
    get isAuthenticated() { return !!this._user.value }

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

            // Proactively check for tokens in URL before fetching
            this.checkUrlToken();

            try {
                console.log('[IdentityService] Fetching profile via ApiClient...')
                const data = await authApi.get<{ user: User; token?: string }>('/auth/me', {
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

    async login(provider?: string) {
        const returnTo = window.location.href

        if (!provider) {
            window.location.href = `/signin?redirect=${encodeURIComponent(returnTo)}`
            return
        }

        try {
            const result = await authApi.post<{ redirect: boolean; url?: string; token?: string; user?: User }>(
                '/auth/sign-in/social',
                {
                    provider,
                    callbackURL: returnTo,
                    errorCallbackURL: `${window.location.origin}/signin`,
                    disableRedirect: true
                },
                { skipAuthRedirect: true }
            )

            if (result.token) {
                localStorage.setItem('auth_token', result.token)
                await this.fetchUser()
                return
            }

            if (result.url) {
                window.location.href = result.url
                return
            }

            throw new Error('No authorization URL was returned by Better Auth')
        } catch (e) {
            console.error('[IdentityService] Social login failed:', e)
        }
    }

    async loginWithPassword(email: string, password: string): Promise<{ success: boolean; error?: string }> {
        this._isLoading.value = true
        try {
            const data = await authApi.post<{ success: boolean; token: string; user: User }>('/auth/password/login', {
                email,
                password
            })

            localStorage.setItem('auth_token', data.token)
            this._user.value = data.user
            return { success: true }
        } catch (e) {
            console.error('[IdentityService] loginWithPassword failed:', e)
            return {
                success: false,
                error: (e as Error).message || 'Authentication failed'
            }
        } finally {
            this._isLoading.value = false
        }
    }

    async signUpWithPassword(input: {
        firstName: string
        lastName: string
        email: string
        password: string
    }): Promise<{ success: boolean; error?: string }> {
        this._isLoading.value = true
        try {
            const fullName = `${input.firstName} ${input.lastName}`.trim()
            const name = fullName || input.email

            const data = await api.post<{ token?: string; user?: User }>(
                '/auth/sign-up/email',
                {
                    name,
                    email: input.email,
                    password: input.password,
                    rememberMe: true
                },
                { skipAuthRedirect: true }
            )

            if (data.token) {
                localStorage.setItem('auth_token', data.token)
            }

            await this.fetchUser()

            if (!this._user.value) {
                throw new Error('Sign up succeeded but no session was established')
            }

            return { success: true }
        } catch (e) {
            console.error('[IdentityService] signUpWithPassword failed:', e)
            return {
                success: false,
                error: (e as Error).message || 'Sign up failed'
            }
        } finally {
            this._isLoading.value = false
        }
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
        try {
            await api.post('/auth/sign-out', {}, { skipAuthRedirect: true })
        } catch (e) {
            console.warn('[IdentityService] Sign-out failed:', e)
        } finally {
            this.purgeState()
            window.location.href = '/signin'
        }
    }
}

export const identityService = new IdentityService()
