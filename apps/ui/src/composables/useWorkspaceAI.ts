import { ref, computed, onMounted, watch, type Ref } from 'vue'
import { getAIModels } from '@/lib/api'
import { localAI } from '@/services/LocalAIService'
import { toast } from '@/composables/useNotifications'
import type { Engine } from '@/components/TableView/Engine/Engine'
import { useEntitlements } from '@/composables/useEntitlements'
import { filterModelsForTier, getDefaultModelForTier } from '@/lib/modelAccess'

export function useWorkspaceAI(
    tabs: Ref<any>,
    activeTab: Ref<any>,
    workspaceStore: any,
    settings: Ref<any>,
    emit: (e: string, ...args: any[]) => void,
    getEngineForTab: (tabId: string) => Engine
) {
    const allModels = ref<any[]>([])
    const aiOptions = ref({ model: 'gemini-3.1-flash', temperature: 0.7 })
    const { subscriptionTier, fetchEntitlements } = useEntitlements()

    // ----- Model Loading ------------------------------------------------

    onMounted(async () => {
        try {
            await fetchEntitlements()
            const [cloud, localStatus] = await Promise.all([
                getAIModels().catch(() => []),
                localAI.getStatus().catch(() => ({ is_running: false, models: [] })),
            ])

            let models = Array.isArray(cloud) ? cloud : (cloud as any).models || []
            const cloudModels = filterModelsForTier(models, subscriptionTier.value)

            if (localStatus.is_running) {
                const local = (localStatus.models || []).map((m: string) => ({
                    id: `local:${m}`,
                    name: m,
                    provider: 'local',
                }))
                models = [...local, ...cloudModels]
            } else {
                models = cloudModels
            }

            allModels.value = models

            if (settings.value && !(settings.value as any).enabledModels) {
                (settings.value as any).enabledModels = models.map((m: any) => m.id)
            }
        } catch (e) {
            console.error('[Workspace] Failed to load AI models:', e)
        }
    })

    const availableModels = computed(() => {
        if (!settings.value) return allModels.value
        const enabled = (settings.value as any)?.enabledModels
        if (enabled?.length > 0) return allModels.value.filter(m => enabled.includes(m.id))
        return allModels.value
    })

    // Auto-select first valid model
    watch(availableModels, (models) => {
        if (models.length > 0) {
            const isCurrentValid = models.some(m => m.id === aiOptions.value.model)
            if (!isCurrentValid || !aiOptions.value.model) {
                aiOptions.value.model = getDefaultModelForTier(models, subscriptionTier.value) || models[0].id
            }
        }
    }, { immediate: true })

    // ----- AI Response Handler ------------------------------------------

    const handleAIResponse = (response: any) => {
        if (response.type === 'generated_table' && response.openInNewTab) {
            const tableName = response.tableName || `Generated Table ${new Date().toLocaleTimeString()}`

            const createdTab = workspaceStore.createTab('table', {
                tableName,
                label: tableName,
                connection: (activeTab.value as any)?.data?.connection || { id: 'local', provider: 'local' },
                provider: (activeTab.value as any)?.data?.provider || 'local',
                headers: response.headers,
                schemaMode: 'named-headers',
            })

            const engine = getEngineForTab(createdTab.id)

            if (engine) {
                engine.beginBatch()

                if (response.headers?.length) {
                    response.headers.forEach((header: string, colIndex: number) => {
                        engine.setValue({ row: 0, col: colIndex }, header, true)
                    })
                }

                if (response.rows?.length) {
                    response.rows.forEach((row: any[], rowIndex: number) => {
                        if (Array.isArray(row)) {
                            row.forEach((value: any, colIndex: number) => {
                                engine.setValue({ row: rowIndex + 1, col: colIndex }, String(value ?? ''), true)
                            })
                        } else if (typeof row === 'object' && row !== null) {
                            response.headers.forEach((header: string, colIndex: number) => {
                                engine.setValue({ row: rowIndex + 1, col: colIndex }, String(row[header] ?? ''), true)
                            })
                        }
                    })
                }

                engine.endBatch()

                if ((createdTab as any).data) {
                    engine.setSource(tableName, (createdTab as any).data.connection, response.headers || [], (createdTab as any).data.provider || 'local')
                }
            }

            workspaceStore.setActiveTab(createdTab.id)
            toast.success(`Created new table "${tableName}"`)
        } else if (response.type === 'message') {
            emit('ai-respond', response.content)
        } else if (response.type === 'processed_data') {
            if (response.content && response.content.length < 200) {
                toast.success(response.content)
            }
        }
    }

    return {
        allModels,
        availableModels,
        aiOptions,
        handleAIResponse,
    }
}
