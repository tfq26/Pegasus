import { computed } from 'vue'
import { identityService } from '@/services/identityService'

export function useAuth() {
    // Reactive wrappers around identityService state
    const user = computed(() => identityService.user)
    const isLoading = computed(() => identityService.isLoading)
    const isOnline = computed(() => identityService.isOnline)
    const isAuthenticated = computed(() => identityService.isAuthenticated)

    return {
        // State (as computed for reactivity)
        user,
        isLoading,
        isOnline,
        isAuthenticated,

        // Methods
        fetchUser: (token?: string) => identityService.fetchUser(token),
        login: () => identityService.login(),
        logout: () => identityService.logout(),
        isTauri: () => identityService.isTauri()
    }
}
