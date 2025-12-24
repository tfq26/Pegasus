import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    fetchDashboards,
    createDashboard,
    fetchDashboard,
    updateDashboard,
    deleteDashboard,
    shareDashboard,
    QUERY_API_URL
} from '@/lib/api'

export interface DashboardElement {
    id: string
    type: string
    title: string
    config: any
    query?: string
    connectionId?: string
    lastResult?: any
    cacheUntil?: number
    refreshFrequency?: number // minutes, 0 means live
}

export interface Dashboard {
    id: string
    title: string
    data: {
        layout: any[]
        elements: DashboardElement[]
        parameters?: Record<string, any>
    }
    is_public: boolean
    share_token: string | null
    updated_at: number
    access_level?: 'owner' | 'editor' | 'viewer' | null
}

export const useDashboardStore = defineStore('dashboard', () => {
    const dashboards = ref<Dashboard[]>([])
    const currentDashboard = ref<Dashboard | null>(null)
    const parameters = ref<Record<string, any>>({})
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    const isSaving = ref(false)
    const isAnalyzing = ref(false)
    const analysisResult = ref<string | null>(null)

    const loadDashboards = async () => {
        isLoading.value = true
        error.value = null
        try {
            dashboards.value = await fetchDashboards()
        } catch (e: any) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    const selectDashboard = async (id: string, forceRefresh = false) => {
        // If we already have the dashboard and not forcing refresh, just set it
        const existing = dashboards.value.find(d => d.id === id)
        if (existing && !forceRefresh) {
            currentDashboard.value = existing
            // Initialize parameters from dashboard data
            parameters.value = existing.data?.parameters || {}
        }

        // Always fetch fresh data in background if we strictly want consistency, 
        // but for "optimistic" feel, we show what we have immediately.
        // If we don't have it, we must load.
        if (!existing || forceRefresh) {
            isLoading.value = true
        }

        error.value = null
        try {
            const dashboard = await fetchDashboard(id)
            currentDashboard.value = dashboard
            parameters.value = dashboard.data?.parameters || {}

            // Update list item if needed
            const index = dashboards.value.findIndex(d => d.id === id)
            if (index !== -1) {
                dashboards.value[index] = { ...dashboards.value[index], ...dashboard }
            } else {
                dashboards.value.push(dashboard)
            }
        } catch (e: any) {
            error.value = e.message
        } finally {
            isLoading.value = false
        }
    }

    const updateParameter = (name: string, value: any) => {
        parameters.value = { ...parameters.value, [name]: value }

        // If we have a current dashboard, we should ideally sync parameters back to its data
        if (currentDashboard.value) {
            if (!currentDashboard.value.data) currentDashboard.value.data = { layout: [], elements: [], parameters: {} }
            currentDashboard.value.data.parameters = { ...parameters.value }
        }
    }

    const createNewDashboard = async (title: string) => {
        isLoading.value = true
        error.value = null
        try {
            const { id } = await createDashboard(title, { layout: [], elements: [], parameters: {} })
            await loadDashboards()
            // We can just fetch the single new dashboard instead of reloading all, but loadDashboards is fine for now
            await selectDashboard(id, true)
            return id
        } catch (e: any) {
            error.value = e.message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    const saveCurrentDashboard = async () => {
        if (!currentDashboard.value) return
        // Use isSaving instead of isLoading to prevent UI blocking
        isSaving.value = true

        console.log('[DashboardStore] saveCurrentDashboard called (background)')

        const payload = {
            title: currentDashboard.value.title,
            data: {
                ...currentDashboard.value.data,
                parameters: parameters.value,
                cover_image: (currentDashboard.value as any).cover_image
            }
        }

        try {
            await updateDashboard(currentDashboard.value.id, payload)
            console.log('[DashboardStore] Dashboard saved successfully')
        } catch (e: any) {
            console.error('[DashboardStore] Save failed:', e)
            error.value = e.message
            // TODO: Revert local changes? For now just notify error.
            throw e
        } finally {
            isSaving.value = false
        }
    }

    const removeDashboard = async (id: string) => {
        try {
            await deleteDashboard(id)
            dashboards.value = dashboards.value.filter(d => d.id !== id)
            if (currentDashboard.value?.id === id) {
                currentDashboard.value = null
            }
        } catch (e: any) {
            error.value = e.message
            throw e
        }
    }

    const generateShareLink = async (id: string) => {
        try {
            const token = await shareDashboard(id)
            if (currentDashboard.value && currentDashboard.value.id === id) {
                currentDashboard.value.share_token = token
                currentDashboard.value.is_public = true
            }
            return token
        } catch (e: any) {
            throw e
        }
    }

    const addElementToDashboard = async (dashboardId: string, element: any) => {
        // Optimistic update: Add to local state first
        isSaving.value = true // Use isSaving to show activity but not block

        try {
            // Use local state if available to be instant
            let dashboard = currentDashboard.value && currentDashboard.value.id === dashboardId
                ? currentDashboard.value
                : dashboards.value.find(d => d.id === dashboardId)

            if (!dashboard) {
                // Fallback to fetch if not found locally at all (rare if user is on the page)
                isLoading.value = true
                dashboard = await fetchDashboard(dashboardId) as Dashboard
                isLoading.value = false
            }

            if (!dashboard) throw new Error('Dashboard not found')

            // Ensure data exists
            const currentData = dashboard.data || { layout: [], elements: [], parameters: {} }
            const newId = crypto.randomUUID()

            // Calculate next position
            const currentLayout = currentData.layout || []
            let y = 0
            if (currentLayout.length > 0) {
                y = Math.max(...currentLayout.map((item: any) => (item.y || 0) + (item.h || 0)))
            }

            const newLayoutItem = {
                x: 0,
                y: y,
                w: element.w || 6,
                h: element.h || 8,
                i: newId
            }

            // Create updated data object
            const updatedData = {
                ...currentData,
                layout: [...currentLayout, newLayoutItem],
                elements: [...(currentData.elements || []), { ...element, id: newId }]
            }

            // apply optimistic update to currentDashboard
            if (currentDashboard.value?.id === dashboardId) {
                currentDashboard.value = {
                    ...currentDashboard.value,
                    data: updatedData
                }
            }

            // apply optimistic update to list
            const index = dashboards.value.findIndex(d => d.id === dashboardId)
            if (index !== -1) {
                const existing = dashboards.value[index]
                if (existing) {
                    dashboards.value[index] = {
                        ...existing,
                        data: updatedData
                    }
                }
            }

            console.log('[DashboardStore] Optimistic update applied. Syncing to backend...')

            // Sync to backend
            await updateDashboard(dashboardId, {
                data: updatedData
            })
            console.log('[DashboardStore] Backend sync completed')

        } catch (e: any) {
            error.value = e.message
            // If failed, we should ideally revert the optimistic update
            // For now, reloading the dashboard is a safe recovery
            if (currentDashboard.value?.id === dashboardId) {
                await selectDashboard(dashboardId, true)
            }
            throw e
        } finally {
            isSaving.value = false
        }
    }

    const executeElementQuery = async (elementId: string, forceRefresh = false) => {
        if (!currentDashboard.value) return

        const element = currentDashboard.value.data.elements.find(el => el.id === elementId)
        if (!element || !element.query || !element.connectionId) return

        // Check cache
        const now = Date.now()
        if (!forceRefresh && element.cacheUntil && element.cacheUntil > now && element.lastResult) {
            console.log(`[DashboardStore] Using cached result for ${elementId}`)
            return element.lastResult
        }

        // Replace parameters in query
        let query = element.query
        Object.entries(parameters.value).forEach(([key, val]) => {
            const regex = new RegExp(`{{${key}}}`, 'g')
            query = query.replace(regex, typeof val === 'string' ? `'${val}'` : val)
        })

        try {
            const response = await fetch(`${QUERY_API_URL}/api/query-by-id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    connectionId: element.connectionId,
                    query: query
                })
            })

            if (!response.ok) throw new Error('Query failed')
            const body = await response.json()

            // Update element data in current dashboard
            const elementIndex = currentDashboard.value.data.elements.findIndex(el => el.id === elementId)
            if (elementIndex !== -1) {
                const updatedElement = { ...currentDashboard.value.data.elements[elementIndex] } as DashboardElement
                updatedElement.lastResult = body.result

                // Cache logic: Default to 5 minutes if not specified, 0 means no cache
                const freq = updatedElement.refreshFrequency !== undefined ? updatedElement.refreshFrequency : 5
                if (freq > 0) {
                    updatedElement.cacheUntil = now + (freq * 60 * 1000)
                }

                if (updatedElement.type === 'stat') {
                    const firstRow = body.result?.[0]
                    if (firstRow) {
                        const firstKey = Object.keys(firstRow)[0]
                        if (firstKey !== undefined) {
                            updatedElement.config.value = firstRow[firstKey]
                        }
                    }
                } else if (body.result && Array.isArray(body.result)) {
                    // Transform raw result to chart config using local generator
                    const { generateChartConfig } = await import('@/lib/chartGenerator')
                    const newConfig = generateChartConfig(body.result, element.query)

                    if (newConfig && newConfig.config && newConfig.config.data) {
                        updatedElement.config.data = newConfig.config.data
                    } else {
                        // Fallback just in case generator fails
                        updatedElement.config.data = body.result
                    }
                } else {
                    updatedElement.config.data = body.result
                }

                currentDashboard.value.data.elements[elementIndex] = updatedElement
            }

            return body.result
        } catch (e: any) {
            console.error('[DashboardStore] executeElementQuery failed:', e)
            throw e
        }
    }

    const importDashboard = async (dashboardData: any) => {
        isLoading.value = true
        try {
            // Generate unique title
            let title = dashboardData.title
            const existingTitles = new Set(dashboards.value.map(d => d.title))

            if (existingTitles.has(title)) {
                let baseTitle = title
                let counter = 1

                // Check if title already has a number suffix like " (1)"
                const match = title.match(/^(.*) \((\d+)\)$/)
                if (match) {
                    baseTitle = match[1]
                    counter = parseInt(match[2]) + 1
                }

                while (existingTitles.has(`${baseTitle} (${counter})`)) {
                    counter++
                }
                title = `${baseTitle} (${counter})`
            }
            // Create a new dashboard with the shared data
            // We need to regenerate IDs for elements to avoid conflicts if we ever merge or just to be clean
            const elements = dashboardData.data.elements.map((el: any): DashboardElement => ({
                id: crypto.randomUUID(),
                type: el.type || 'chart',
                title: el.title || 'Untitled',
                config: el.config || {},
                query: el.query,
                connectionId: el.connectionId,
                lastResult: el.lastResult,
                cacheUntil: el.cacheUntil,
                refreshFrequency: el.refreshFrequency
            }))

            // We also need to update the layout to reference the new element IDs
            // This is tricky because layout items map to element IDs via 'i' property
            // Let's create a map of old ID -> new ID
            const idMap = new Map()
            dashboardData.data.elements.forEach((el: any, index: number) => {
                idMap.set(el.id, elements[index].id)
            })

            const layout = dashboardData.data.layout.map((item: any) => ({
                ...item,
                i: idMap.get(item.i) || item.i // Fallback to old ID if not found (shouldn't happen)
            }))

            const newData = {
                layout,
                elements,
                parameters: dashboardData.data.parameters || {}
            }

            const { id } = await createDashboard(title, newData)
            await loadDashboards()
            return id
        } catch (e: any) {
            error.value = e.message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    const refreshDashboard = async (forceRefresh = false) => {
        if (!currentDashboard.value) return

        console.log(`[DashboardStore] Refreshing all elements (force=${forceRefresh})`)
        const elements = currentDashboard.value.data.elements

        // Execute all queries in parallel
        const promises = elements
            .filter(el => el.query && el.connectionId)
            .map(el => executeElementQuery(el.id, forceRefresh))

        try {
            await Promise.all(promises)
            console.log('[DashboardStore] All elements refreshed')
        } catch (e) {
            console.error('[DashboardStore] Some elements failed to refresh:', e)
        }
    }

    return {
        dashboards,
        currentDashboard,
        parameters,
        isLoading,
        isSaving,
        isAnalyzing,
        analysisResult,
        error,
        loadDashboards,
        selectDashboard,
        updateParameter,
        createNewDashboard,
        saveCurrentDashboard,
        removeDashboard,
        generateShareLink,
        addElementToDashboard,
        executeElementQuery,
        refreshDashboard,
        importDashboard
    }
})
