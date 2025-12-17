import { ref } from 'vue'
import { useFeatureFlags } from './useFeatureFlags'

const user = ref(null)
const isLoading = ref(true)

const API_URL = import.meta.env.VITE_QUERY_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`

export function useAuth() {
    const { setUser } = useFeatureFlags()

    const fetchUser = async () => {
        isLoading.value = true
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                credentials: 'include'
            })
            const data = await res.json()
            user.value = data.user
            // Sync with feature flags composable
            setUser(data.user)
        } catch (e) {
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
