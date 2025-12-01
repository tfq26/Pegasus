import { ref } from 'vue'

const user = ref(null)
const isLoading = ref(true)

export function useAuth() {
    const fetchUser = async () => {
        isLoading.value = true
        try {
            const res = await fetch('http://localhost:3000/auth/me', {
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
        window.location.href = 'http://localhost:3000/auth/login'
    }

    const logout = () => {
        window.location.href = 'http://localhost:3000/auth/logout'
    }

    return {
        user,
        isLoading,
        fetchUser,
        login,
        logout
    }
}
