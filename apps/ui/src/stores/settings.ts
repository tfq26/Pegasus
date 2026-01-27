import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/lib/apiClient'
import type { SettingsModel } from '@/views/settings/types'

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref<SettingsModel>({
        language: 'English',
        aiDetail: 1,
        enableContext: true,
        enableCodeHints: true,
        autoSaveQueries: true,
        syntaxHighlighting: true,
        showQueryTips: false,
        autoRefresh: true,
        showRowCount: true,
        cloudProvider: 'Azure',
        cloudRegion: 'eastus2',
        showDashboardGrid: true,
        compactMode: false,
        dashboardLocked: false,
        githubConnected: false,
        slackConnected: false,
        azureConnected: true,
        enabledModels: [],
        activeModel: 'gemini-3-flash-preview',
        temperature: 0.7,
        maxTokens: 2000,
        chatAutoDeleteDays: 30,
        azureCredentials: {
            tenantId: '',
            clientId: '',
            clientSecret: '',
            subscriptionId: ''
        },
        awsCredentials: {
            accessKeyId: '',
            secretAccessKey: '',
            region: 'us-east-1'
        }
    })

    const isLoading = ref(false)

    async function loadSettings() {
        isLoading.value = true
        try {
            const res = await api.get<{ settings: SettingsModel }>('/settings')
            if (res.settings) {
                settings.value = { ...settings.value, ...res.settings }
            }
        } catch (e) {
            console.error('[SettingsStore] Failed to load settings', e)
        } finally {
            isLoading.value = false
        }
    }

    async function saveSettings() {
        try {
            await api.post('/settings', settings.value)
        } catch (e) {
            console.error('[SettingsStore] Failed to save settings', e)
            throw e
        }
    }

    const availableModels = ref<any[]>([])
    const isModelsLoading = ref(false)

    // Helper to filter models based on tier (reused logic)
    const filterModelsByTier = (models: any[], tier: string) => {
        const TIER_REQUIREMENTS: Record<string, string> = {
            'gpt-5.1-mini': 'free', 'o4-mini': 'pro', 'gpt-5.1': 'pro',
            'gemini-2.5-flash-lite': 'free', 'gemini-3-flash-preview': 'pro', 'gemini-3-pro-preview': 'pro',
            'claude-3-5-haiku-latest': 'pro', 'claude-3-5-sonnet-latest': 'pro', 'claude-3-opus-latest': 'pro_plus',
            'gpt-4o-mini': 'free', 'gemini-2.5-flash': 'free', 'gemini-2.5-pro': 'free', 'gemini-1.5-flash': 'free',
            'gemini-1.5-pro': 'pro'
        }
        const TIER_ORDER: Record<string, number> = { 'free': 0, 'pro': 1, 'pro_plus': 2, 'teams': 3, 'enterprise': 4 }

        return models.map(m => {
            const requiredTier = TIER_REQUIREMENTS[m.id] || 'free'
            const userTierLevel = TIER_ORDER[tier] || 0
            const requiredTierLevel = TIER_ORDER[requiredTier] || 0
            return {
                ...m,
                isLocked: requiredTierLevel > userTierLevel,
                requiredTier
            }
        })
    }

    async function loadAvailableModels(tier: string = 'free') {
        isModelsLoading.value = true
        try {
            // Note: In a real app we might want to inject other dependencies or pass them in
            // For now we use the direct API call similar to AITab logic
            const res = await api.get<{ models: any[], tier?: string }>('/ai/models')
            const rawModels = Array.isArray(res) ? res : (res.models || [])

            // Process models
            availableModels.value = filterModelsByTier(rawModels, tier)
        } catch (e) {
            console.error('[SettingsStore] Failed to load models', e)
        } finally {
            isModelsLoading.value = false
        }
    }

    // Only returns models that are NOT locked and are enabled by user
    const usableModels = computed(() => {
        const enabled = settings.value.enabledModels || []
        // If enabled list is empty/undefined, default to all unlocked models
        if (!enabled.length) {
            return availableModels.value.filter(m => !m.isLocked)
        }
        return availableModels.value.filter(m => !m.isLocked && enabled.includes(m.id))
    })

    return {
        settings,
        isLoading,
        availableModels,
        isModelsLoading,
        usableModels,
        loadSettings,
        saveSettings,
        loadAvailableModels
    }
})
