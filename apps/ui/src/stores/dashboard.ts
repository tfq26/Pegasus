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
}

export const useDashboardStore = defineStore('dashboard', () => {
    const dashboards = ref<Dashboard[]>([])
    const currentDashboard = ref<Dashboard | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)

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

    const selectDashboard = async (id: string) => {
        isLoading.value = true
        error.value = null
        try {
            const dashboard = await fetchDashboard(id)
            currentDashboard.value = dashboard
            // Update list item if needed
            const index = dashboards.value.findIndex(d => d.id === id)
            if (index !== -1) {
                dashboards.value[index] = { ...dashboards.value[index], ...dashboard }
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
            await selectDashboard(id)
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
        isLoading.value = true
        try {
            await updateDashboard(currentDashboard.value.id, {
                title: currentDashboard.value.title,
                data: currentDashboard.value.data
            })
        } catch (e: any) {
            error.value = e.message
            throw e
        } finally {
            isLoading.value = false
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
        isLoading.value = true
        try {
            // Find the dashboard
            let dashboard = dashboards.value.find(d => d.id === dashboardId)

            // If not in list or we need fresh data, fetch it
            if (!dashboard) {
                dashboard = await fetchDashboard(dashboardId) as Dashboard
            } else {
                // We should probably fetch fresh data anyway to avoid conflicts, 
                // but for now let's trust the local state if we have it, 
                // or maybe just fetch to be safe? 
                // Let's fetch to be safe and ensure we have the latest 'data' blob
                dashboard = await fetchDashboard(dashboardId) as Dashboard
            }

            if (!dashboard) throw new Error('Dashboard not found')

            console.log('[DashboardStore] Adding element to dashboard:', dashboardId)
            console.log('[DashboardStore] Current dashboard data:', dashboard.data)

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
                w: 6,
                h: 8,
                i: newId
            }

            // Add element
            const updatedData = {
                ...currentData,
                layout: [...currentLayout, newLayoutItem],
                elements: [...(currentData.elements || []), { ...element, id: newId }]
            }

            console.log('[DashboardStore] Updated data:', updatedData)

            // Update backend
            await updateDashboard(dashboardId, {
                data: updatedData
            })
            console.log('[DashboardStore] Backend update completed')

            // Update local state
            const index = dashboards.value.findIndex(d => d.id === dashboardId)
            if (index !== -1) {
                const existing = dashboards.value[index]!
                dashboards.value[index] = {
                    id: existing.id,
                    title: existing.title,
                    data: updatedData,
                    is_public: existing.is_public,
                    share_token: existing.share_token,
                    updated_at: existing.updated_at
                }
            }

            // If it's the current dashboard, update that too
            if (currentDashboard.value?.id === dashboardId) {
                currentDashboard.value.data = updatedData
            }

        } catch (e: any) {
            error.value = e.message
            throw e
        } finally {
            isLoading.value = false
        }
    }

    const importDashboard = async (dashboardData: any) => {
        isLoading.value = true
        try {
            const title = `${dashboardData.title} (Imported)`
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
