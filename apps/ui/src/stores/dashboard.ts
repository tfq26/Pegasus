import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    fetchDashboards,
    createDashboard,
    fetchDashboard,
    updateDashboard,
    deleteDashboard,
    shareDashboard
} from '@/lib/api'

export interface Dashboard {
    id: string
    title: string
    data: {
        layout: any[]
        elements: any[]
    }
    is_public: boolean
    share_token: string | null
    updated_at: number
    access_level?: 'owner' | 'editor' | 'viewer' | null
}

export const useDashboardStore = defineStore('dashboard', () => {
    const dashboards = ref<Dashboard[]>([])
    const currentDashboard = ref<Dashboard | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    const isSaving = ref(false)

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

    const createNewDashboard = async (title: string) => {
        isLoading.value = true
        error.value = null
        try {
            const { id } = await createDashboard(title, { layout: [], elements: [] })
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
            const currentData = dashboard.data || { layout: [], elements: [] }
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
            const elements = dashboardData.data.elements.map((el: any) => ({
                ...el,
                id: crypto.randomUUID()
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
                elements
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

    return {
        dashboards,
        currentDashboard,
        isLoading,
        isSaving,
        error,
        loadDashboards,
        selectDashboard,
        createNewDashboard,
        saveCurrentDashboard,
        removeDashboard,
        generateShareLink,
        addElementToDashboard,
        importDashboard
    }
})
