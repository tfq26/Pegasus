import { defineStore } from 'pinia'
import { ref } from 'vue'
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
        downloadsFolder: '',
        localModel: '',
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

    return {
        settings,
        isLoading,
        loadSettings,
        saveSettings
    }
})
