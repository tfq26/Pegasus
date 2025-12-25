// Desktop Auth Composable - Handles local offline auth for Tauri
import { ref, computed } from 'vue'

// Types
interface LocalUser {
    id: string
    username: string
    email: string | null
    is_cloud_linked: boolean
}

interface AuthResponse {
    success: boolean
    message: string
    user: LocalUser | null
}

// State
const localUser = ref<LocalUser | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const isOnline = ref(navigator.onLine)

// Check if running in Tauri
const isTauriEnv = () => '__TAURI_INTERNALS__' in window

// Watch online status
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { isOnline.value = true })
    window.addEventListener('offline', () => { isOnline.value = false })
}

export function useDesktopAuth() {
    const isAuthenticated = computed(() => localUser.value !== null)
    const needsCloudLink = computed(() => localUser.value !== null && !localUser.value.is_cloud_linked)

    // Check for existing session on load
    const checkSession = async () => {
        if (!isTauriEnv()) return null

        isLoading.value = true
        error.value = null

        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const user = await invoke<LocalUser | null>('get_local_user')
            localUser.value = user
            return user
        } catch (e) {
            console.error('[DesktopAuth] Failed to check session:', e)
            error.value = 'Failed to check session'
            return null
        } finally {
            isLoading.value = false
        }
    }

    // Create new local account
    const createAccount = async (username: string, password: string, email?: string) => {
        if (!isTauriEnv()) {
            throw new Error('Desktop auth only available in Tauri')
        }

        isLoading.value = true
        error.value = null

        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const response = await invoke<AuthResponse>('create_local_account', {
                username,
                password,
                email: email || null
            })

            if (response.success && response.user) {
                localUser.value = response.user
                return response
            } else {
                error.value = response.message
                return response
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            error.value = message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    // Login with local account
    const login = async (username: string, password: string) => {
        if (!isTauriEnv()) {
            throw new Error('Desktop auth only available in Tauri')
        }

        isLoading.value = true
        error.value = null

        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const response = await invoke<AuthResponse>('local_login', {
                username,
                password
            })

            if (response.success && response.user) {
                localUser.value = response.user
                return response
            } else {
                error.value = response.message
                return response
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            error.value = message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    // Logout
    const logout = async () => {
        if (!isTauriEnv()) return

        try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke('local_logout')
            localUser.value = null
        } catch (e) {
            console.error('[DesktopAuth] Logout failed:', e)
        }
    }

    // Link to cloud (WorkOS)
    const linkToCloud = async (cloudUserId: string, cloudEmail: string) => {
        if (!isTauriEnv()) {
            throw new Error('Desktop auth only available in Tauri')
        }

        isLoading.value = true
        error.value = null

        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const response = await invoke<AuthResponse>('link_to_cloud', {
                cloudUserId,
                cloudEmail
            })

            if (response.success && response.user) {
                localUser.value = response.user
                return response
            } else {
                error.value = response.message
                return response
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            error.value = message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    // Login with cloud using Device Authorization Flow
    const loginWithCloud = async () => {
        if (!isTauriEnv()) {
            throw new Error('Desktop auth only available in Tauri')
        }

        const API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

        isLoading.value = true
        error.value = null

        try {
            // Step 1: Request a device code from the backend
            const res = await fetch(`${API_URL}/auth/device/code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()

            if (!data.device_code || !data.user_code) {
                throw new Error('Failed to get device code')
            }

            console.log('[DesktopAuth] Device code:', data.user_code)

            // Step 2: Open browser with the verification URL
            const { open } = await import('@tauri-apps/plugin-shell')
            const verificationUrl = `${data.verification_url}?code=${data.user_code}`
            console.log('[DesktopAuth] Opening browser:', verificationUrl)
            await open(verificationUrl)

            // Step 3: Poll for authorization
            const pollInterval = 2000 // 2 seconds
            const maxAttempts = Math.floor(data.expires_in / 2) || 300 // ~10 minutes

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise(resolve => setTimeout(resolve, pollInterval))

                const tokenRes = await fetch(`${API_URL}/auth/device/token?device_code=${data.device_code}`)
                const tokenData = await tokenRes.json()

                if (tokenData.access_token) {
                    // Success!
                    console.log('[DesktopAuth] Device authorized for:', tokenData.user?.email)
                    localStorage.setItem('auth_token', tokenData.access_token)

                    // Store in local auth if we have a local user
                    if (localUser.value && tokenData.user) {
                        await linkToCloud(tokenData.user.sub || tokenData.user.id, tokenData.user.email)
                    }

                    return {
                        success: true,
                        token: tokenData.access_token,
                        user: tokenData.user
                    }
                }

                if (tokenData.error && tokenData.error !== 'authorization_pending') {
                    throw new Error(tokenData.error_description || tokenData.error)
                }

                // Still pending, continue polling
                console.log('[DesktopAuth] Polling... attempt', attempt + 1)
            }

            throw new Error('Authorization timed out')
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            error.value = message
            console.error('[DesktopAuth] Cloud login failed:', e)
            throw e
        } finally {
            isLoading.value = false
        }
    }

    return {
        // State
        localUser,
        isLoading,
        error,
        isOnline,

        // Computed
        isAuthenticated,
        needsCloudLink,
        isTauri: isTauriEnv,

        // Actions
        checkSession,
        createAccount,
        login,
        logout,
        linkToCloud,
        loginWithCloud
    }
}
