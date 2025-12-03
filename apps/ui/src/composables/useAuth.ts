import { ref } from 'vue'

const user = ref(null)
const isLoading = ref(true)

const API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

export function useAuth() {
    const fetchUser = async () => {
        isLoading.value = true
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                credentials: 'include'
            })
            const data = await res.json()
            user.value = data.user
        } catch (e) {
            user.value = null
        } finally {
            isLoading.value = false
        }
    }

    const login = () => {
        window.location.href = `${API_URL}/auth/login`
    }

    const logout = () => {
        window.location.href = `${API_URL}/auth/logout`
    }

    return {
        user,
        isLoading,
        fetchUser,
        login,
        logout
    }
}
