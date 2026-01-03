import { ref } from 'vue'
import { useFeatureFlags } from './useFeatureFlags'

interface User {
    id: string
    email: string
    firstName?: string
    lastName?: string
    profilePictureUrl?: string
    subscription_tier?: string
}

const user = ref<User | null>(null)
const isLoading = ref(true)
const isOnline = ref(navigator.onLine)

// Check if running in Tauri desktop app
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Watch online status
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { isOnline.value = true })
    window.addEventListener('offline', () => { isOnline.value = false })
}

const API_URL = import.meta.env.VITE_QUERY_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`

// Check for token in URL (from OAuth redirect) and store in localStorage
const checkUrlToken = () => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (token) {
        console.log('[Auth] Token found in URL, storing in localStorage')
        localStorage.setItem('auth_token', token)

        // Clean up URL
        params.delete('token')
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
        window.history.replaceState({}, '', newUrl)

        return token
    }

    return localStorage.getItem('auth_token')
}

// Initialize token check on module load (runs immediately when module is imported)
// Note: This is intentionally NOT wrapped in onMounted because this is module-level code
checkUrlToken()

export function useAuth() {
    const { setUser } = useFeatureFlags()

    const fetchUser = async () => {
        isLoading.value = true

        // In Tauri + offline, skip web auth
        if (isTauri() && !isOnline.value) {
            console.log('[Auth] Tauri offline mode - skipping web auth')
            isLoading.value = false
            return
        }

        try {
            // Get token from localStorage (mobile) or rely on cookie (desktop)
            const token = checkUrlToken()

            const headers: HeadersInit = {
                'Content-Type': 'application/json'
            }

            // Add Authorization header if we have a token in localStorage
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            }

            const res = await fetch(`${API_URL}/auth/me`, {
                credentials: 'include', // Still send cookies if available
                headers
            })
            const data = await res.json()

            console.log('[Auth] /auth/me response:', { hasUser: !!data.user, hasToken: !!data.token })

            // Store token in localStorage if returned (for cross-origin requests)
            if (data.token) {
                console.log('[Auth] Storing token in localStorage:', data.token.substring(0, 20) + '...')
                localStorage.setItem('auth_token', data.token)
            } else {
                console.warn('[Auth] No token in /auth/me response!')
            }

            user.value = data.user
            // Sync with feature flags composable
            setUser(data.user)

            console.log('[Auth] User fetched:', data.user ? 'Logged in' : 'Not logged in')
        } catch (e) {
            console.error('[Auth] Failed to fetch user:', e)

            // In Tauri, network failures are expected when offline
            if (isTauri()) {
                console.log('[Auth] Network error in Tauri - will use local auth')
            }

            user.value = null
            setUser(null)
        } finally {
            isLoading.value = false
        }
    }

    const login = async () => {
        // In Tauri + offline, redirect to local auth
        if (isTauri() && !isOnline.value) {
            window.location.href = '/local-auth'
            return
        }

        // In Tauri + online, use Device Authorization Flow
        if (isTauri()) {
            try {
                const { useDesktopAuth } = await import('./useDesktopAuth')
                const { loginWithCloud } = useDesktopAuth()
                const result = await loginWithCloud()

                if (result.success && result.user) {
                    // Refresh user state
                    user.value = result.user
                    setUser(result.user)
                    console.log('[Auth] Device flow login successful:', result.user.email)
                }
                return
            } catch (e) {
                console.error('[Auth] Device flow login failed:', e)
                // Could show error toast here
                return
            }
        }

        const returnTo = window.location.origin;
        window.location.href = `${API_URL}/auth/login?return_to=${encodeURIComponent(returnTo)}`
    }

    const logout = async () => {
        // In Tauri, also clear local auth
        if (isTauri()) {
            try {
                const { invoke } = await import('@tauri-apps/api/core')
                await invoke('local_logout')
            } catch (e) {
                console.warn('[Auth] Tauri local logout failed:', e)
            }
        }

        try {
            await fetch(`${API_URL}/auth/logout`, { credentials: 'include' })
            localStorage.removeItem('auth_token')
        } catch (e) {
            console.error('Logout failed', e)
        } finally {
            user.value = null
            setUser(null)
            window.location.href = '/'
        }
    }

    return {
        user,
        isLoading,
        isOnline,
        fetchUser,
        login,
        logout,
        isTauri
    }
}
