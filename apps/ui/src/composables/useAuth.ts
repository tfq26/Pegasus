import { ref, onMounted } from 'vue'
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

// Initialize token check on module load
onMounted(() => {
    checkUrlToken()
})

export function useAuth() {
    const { setUser } = useFeatureFlags()

    const fetchUser = async () => {
        isLoading.value = true
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
            user.value = null
            setUser(null)
        } finally {
            isLoading.value = false
        }
    }

    const login = () => {
        const returnTo = window.location.origin;
        window.location.href = `${API_URL}/auth/login?return_to=${encodeURIComponent(returnTo)}`
    }

    const logout = async () => {
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
        fetchUser,
        login,
        logout
    }
}
