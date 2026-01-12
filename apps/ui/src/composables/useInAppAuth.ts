/**
 * In-App OAuth Authentication for Desktop
 * 
 * Epic Games Launcher style - opens a WebView window for SSO
 */
import { ref } from 'vue'
import { api } from '@/lib/apiClient'
import { identityService } from '@/services/identityService'

const isAuthenticating = ref(false)
const authError = ref<string | null>(null)

export function useInAppAuth() {
    /**
     * Initiate in-app OAuth login
     * Opens a new Tauri WebView window for WorkOS authentication
     */
    const login = async (provider: string = 'authkit'): Promise<{ success: boolean; error?: string }> => {
        if (isAuthenticating.value) {
            return { success: false, error: 'Authentication already in progress' }
        }

        isAuthenticating.value = true
        authError.value = null

        try {
            // 1. Get a device code to use as a sync session
            const deviceRes = await api.post<{ device_code: string }>('/auth/device/code', {})
            const deviceCode = deviceRes.device_code

            // 2. Get the authorization URL from backend
            let loginUrl = `/auth/desktop/login?provider=${provider}&state=${deviceCode}`

            const { url } = await api.get<{ url: string; traceId: string }>(loginUrl, {
                skipAuthRedirect: true
            })

            if (!url) {
                throw new Error('Failed to get authorization URL')
            }

            console.log('[BrowserAuth] Opening system browser for login (Session:', deviceCode, ')')

            // 3. Open the system browser
            const { open } = await import('@tauri-apps/plugin-shell')
            await open(url)

            // 4. Dual-track waiting: Deep Link (instant) OR Device Flow Polling (reliable fallback)
            return new Promise((resolve) => {
                let checkCount = 0
                const maxChecks = 180 // 3 minutes

                const checkForAuth = setInterval(async () => {
                    checkCount++

                    // Track 1: Check if deep link already signed us in via IdentityService
                    if (identityService.isAuthenticated) {
                        clearInterval(checkForAuth)
                        isAuthenticating.value = false
                        resolve({ success: true })
                        return
                    }

                    // Track 2: Poll the backend for the device code status
                    if (checkCount % 2 === 0) { // Poll every 2 seconds
                        try {
                            const pollRes = await fetch(`${api.getBaseUrl()}/auth/device/token?device_code=${deviceCode}`)
                            const pollData = await pollRes.json()

                            if (pollData.access_token) {
                                console.log('[BrowserAuth] Polling success, token captured')
                                localStorage.setItem('auth_token', pollData.access_token)
                                await identityService.fetchUser()
                                clearInterval(checkForAuth)
                                isAuthenticating.value = false
                                resolve({ success: true })
                                return
                            }
                        } catch (e) {
                            // Ignore polling errors
                        }
                    }

                    // Timeout
                    if (checkCount >= maxChecks) {
                        clearInterval(checkForAuth)
                        isAuthenticating.value = false
                        authError.value = 'Login timed out'
                        resolve({ success: false, error: 'Login timed out' })
                    }
                }, 1000)
            })

        } catch (e) {
            console.error('[BrowserAuth] Login failed:', e)
            const message = e instanceof Error ? e.message : 'Login failed'
            authError.value = message
            isAuthenticating.value = false
            return { success: false, error: message }
        }
    }

    /**
     * Cancel ongoing authentication
     */
    const cancel = async () => {
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
            const authWindow = await WebviewWindow.getByLabel('auth-window')
            if (authWindow) {
                await authWindow.close()
            }
        } catch (e) {
            // Window might not exist
        }
        isAuthenticating.value = false
        authError.value = null
    }

    return {
        isAuthenticating,
        authError,
        login,
        cancel
    }
}
