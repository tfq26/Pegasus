import { ref, computed } from 'vue'

interface User {
    sub: string
    email: string
    featureFlags?: string[]
}

const currentUser = ref<User | null>(null)

export function useFeatureFlags() {
    const featureFlags = computed(() => currentUser.value?.featureFlags || [])

    const hasFeature = (featureId: string) => {
        return featureFlags.value.includes(featureId)
    }

    const setUser = (user: User | null) => {
        currentUser.value = user
    }

    // Feature-specific helpers
    const hasManualFormulas = computed(() => hasFeature('manual-excel-formulas'))
    const hasAdvancedAI = computed(() => hasFeature('advanced-ai-modes'))
    const hasQueryInsights = computed(() => hasFeature('query-performance-insights'))

    return {
        featureFlags,
        hasFeature,
        setUser,
        hasManualFormulas,
        hasAdvancedAI,
        hasQueryInsights
    }
}
