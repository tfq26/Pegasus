import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
    fetchDashboards,
    createDashboard,
    fetchDashboard,
    updateDashboard,
    deleteDashboard,
    shareDashboard,
    fetchRecentDashboards,
    trackDashboardAccess,
    QUERY_API_URL,
    api
} from '@/lib/api'
import { identityService } from '@/services/identityService'

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
    created_by_name?: string
}

export interface DashboardPage {
    id: string
    title: string
    order: number
    layout: any[]
    elements: DashboardElement[]
}

export interface Dashboard {
    id: string
    title: string
    data: {
        // Legacy root fields (kept for backward compat or migrated)
        layout?: any[]
        elements?: DashboardElement[]

        // New Pages
        pages?: DashboardPage[]

        parameters?: Record<string, any>
    }
    is_public: boolean
    share_token: string | null
    updated_at: number
    access_level?: 'owner' | 'editor' | 'viewer' | null
}

export const useDashboardStore = defineStore('dashboard', () => {
    const dashboards = ref<Dashboard[]>([])
    const recentDashboards = ref<Dashboard[]>([])
    const currentDashboard = ref<Dashboard | null>(null)
    const activePageId = ref<string | null>(null)
    const parameters = ref<Record<string, any>>({})
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    const isSaving = ref(false)
    const isAnalyzing = ref(false)
    const analysisResult = ref<string | null>(null)

    // Helper: Migrate legacy dashboard to have pages
    const migrateDashboard = (dashboard: Dashboard) => {
        if (!dashboard.data) {
            dashboard.data = { layout: [], elements: [], pages: [], parameters: {} }
        }

        // If no pages exist but we have root layout/elements, move them to Page 1
        if ((!dashboard.data.pages || dashboard.data.pages.length === 0) &&
            (dashboard.data.layout?.length || dashboard.data.elements?.length)) {

            const pageId = crypto.randomUUID()
            dashboard.data.pages = [{
                id: pageId,
                title: 'Overview', // Default title
                order: 0,
                layout: dashboard.data.layout || [],
                elements: dashboard.data.elements || []
            }]

            // Clear root fields to avoid confusion/duplication effectively
            // But we might want to keep them 'in sync' for a while if older clients use them
            // For now, the source of truth becomes 'pages'
            dashboard.data.layout = []
            dashboard.data.elements = []

            return pageId
        } else if (dashboard.data.pages && dashboard.data.pages.length > 0) {
            // Already has pages
            // Ensure they are sorted
            dashboard.data.pages.sort((a, b) => a.order - b.order)
            return dashboard.data.pages[0].id
        } else {
            // Empty dashboard, create first page
            const pageId = crypto.randomUUID()
            dashboard.data.pages = [{
                id: pageId,
                title: 'Overview',
                order: 0,
                layout: [],
                elements: []
            }]
            return pageId
        }
    }

    // Get current active page object
    const activePage = computed(() => {
        if (!currentDashboard.value?.data?.pages) return null
        return currentDashboard.value.data.pages.find(p => p.id === activePageId.value)
    })

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

    const loadRecentDashboards = async () => {
        try {
            recentDashboards.value = await fetchRecentDashboards()
        } catch (e: any) {
            console.error('Failed to load recent dashboards:', e)
        }
    }

    const selectDashboard = async (id: string, forceRefresh = false) => {
        // Track access in backend (fire and forget)
        trackDashboardAccess(id).catch(err => console.error('Failed to track access:', err))

        // If we already have the dashboard and not forcing refresh, just set it
        const existing = dashboards.value.find(d => d.id === id)
        if (existing && !forceRefresh) {
            currentDashboard.value = JSON.parse(JSON.stringify(existing)) // Deep copy to avoid reference issues
            // Initialize parameters from dashboard data
            parameters.value = existing.data?.parameters || {}

            // Migrate if needed and set active page
            const pageId = migrateDashboard(currentDashboard.value!)
            if (!activePageId.value || !currentDashboard.value!.data.pages?.find(p => p.id === activePageId.value)) {
                activePageId.value = pageId
            }
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

            // Migrate and set active page
            const pageId = migrateDashboard(currentDashboard.value!)
            // Reset active page to first page on fresh load
            activePageId.value = pageId

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
            if (!currentDashboard.value.data) {
                // Should be covered by migrate, but safe guard
                currentDashboard.value.data = { messages: [], layout: [], elements: [], pages: [], parameters: {} } as any
            }
            currentDashboard.value.data.parameters = { ...parameters.value }
        }
    }

    const createNewDashboard = async (title: string) => {
        isLoading.value = true
        error.value = null
        try {
            // Create with initial page structure
            const pageId = crypto.randomUUID()
            const initialData = {
                layout: [],
                elements: [],
                pages: [{
                    id: pageId,
                    title: 'Overview',
                    order: 0,
                    layout: [],
                    elements: []
                }],
                parameters: {}
            }

            const { id } = await createDashboard(title, initialData)
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

    // New Page Actions
    const addPage = async (title: string = 'New Page') => {
        if (!currentDashboard.value?.data?.pages) return

        // Calculate new order
        const maxOrder = Math.max(...currentDashboard.value.data.pages.map(p => p.order), -1)

        const newPage: DashboardPage = {
            id: crypto.randomUUID(),
            title,
            order: maxOrder + 1,
            layout: [],
            elements: []
        }

        currentDashboard.value.data.pages.push(newPage)
        activePageId.value = newPage.id
        await saveCurrentDashboard()
    }

    const removePage = async (pageId: string) => {
        if (!currentDashboard.value?.data?.pages) return
        if (currentDashboard.value.data.pages.length <= 1) {
            throw new Error("Cannot delete the last page")
        }

        const index = currentDashboard.value.data.pages.findIndex(p => p.id === pageId)
        if (index === -1) return

        currentDashboard.value.data.pages.splice(index, 1)

        // If we deleted the active page, switch to the first available
        if (activePageId.value === pageId) {
            activePageId.value = currentDashboard.value.data.pages[0].id
        }

        await saveCurrentDashboard()
    }

    const renamePage = async (pageId: string, newTitle: string) => {
        if (!currentDashboard.value?.data?.pages) return
        const page = currentDashboard.value.data.pages.find(p => p.id === pageId)
        if (page) {
            page.title = newTitle
            await saveCurrentDashboard()
        }
    }

    const saveCurrentDashboard = async () => {
        if (!currentDashboard.value) return
        // Use isSaving instead of isLoading to prevent UI blocking
        isSaving.value = true

        console.log('[DashboardStore] saveCurrentDashboard called (background)')

        // Ensure we save the full structure including pages
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

            // Ensure data exists and is migrated
            if (!dashboard.data) dashboard.data = { layout: [], elements: [], pages: [], parameters: {} } as any

            // Ensure we target the ACTIVE PAGE (or the first page if not active)
            let targetPage = dashboard.data.pages?.find(p => p.id === activePageId.value)
            if (!targetPage) {
                // Fallback to migration logic if pages missing
                const pid = migrateDashboard(dashboard)
                targetPage = dashboard.data.pages!.find(p => p.id === pid)!
                activePageId.value = pid
            }

            const newId = crypto.randomUUID()

            // Calculate next position
            const currentLayout = targetPage.layout || []
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
            const userName = identityService.user
                ? `${identityService.user.firstName || ''} ${identityService.user.lastName || ''}`.trim() || identityService.user.email
                : 'Unknown'

            // Add only to the specific page
            targetPage.layout.push(newLayoutItem)
            targetPage.elements.push({
                ...element,
                id: newId,
                created_by_name: userName
            })

            console.log('[DashboardStore] Optimistic update applied. Syncing to backend...')

            // Sync to backend
            // We send the whole data object which now contains the updated page
            await updateDashboard(dashboardId, {
                data: dashboard.data
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

        // Find element across all pages
        let foundElement: DashboardElement | undefined
        let foundPage: DashboardPage | undefined

        for (const page of currentDashboard.value.data.pages || []) {
            const el = page.elements.find(e => e.id === elementId)
            if (el) {
                foundElement = el
                foundPage = page
                break
            }
        }

        const element = foundElement
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
            const body = await api.post<any>('/api/query-by-id', {
                connectionId: element.connectionId,
                query: query
            })

            // Update element data in current dashboard (in the correct page)
            if (foundPage) {
                const elementIndex = foundPage.elements.findIndex(el => el.id === elementId)
                if (elementIndex !== -1) {
                    const updatedElement = { ...foundPage.elements[elementIndex] } as DashboardElement
                    updatedElement.lastResult = body.result

                    // Cache logic: Default to 5 minutes if not specified, 0 means no cache
                    const freq = updatedElement.refreshFrequency !== undefined ? updatedElement.refreshFrequency : 5
                    if (freq > 0) {
                        updatedElement.cacheUntil = now + (freq * 60 * 1000)
                    }

                    if (updatedElement.type === 'stat') {
                        const firstRow = body.result?.[0]
                        if (firstRow) {
                            const keys = Object.keys(firstRow)

                            // 1. Identify Numeric and Categorical Columns
                            const numericKeys = keys.filter(k => typeof firstRow[k] === 'number')
                            const categoricalKeys = keys.filter(k => typeof firstRow[k] === 'string')

                            // 2. Select Value Key (Numeric prefered)
                            const preferredValueNames = ['value', 'stat', 'total', 'count', 'amount', 'salary', 'price', 'cost']
                            let valueKey = numericKeys.find(k => preferredValueNames.includes(k.toLowerCase())) || numericKeys[0] || keys[0]

                            // 3. Select Label Key (Categorical prefered)
                            const preferredLabelNames = ['name', 'label', 'title', 'category', 'type', 'group']
                            let labelKey = categoricalKeys.find(k => preferredLabelNames.includes(k.toLowerCase())) || categoricalKeys[0]

                            // Update config
                            if (valueKey !== undefined) {
                                updatedElement.config.value = firstRow[valueKey]
                            }
                            if (labelKey !== undefined) {
                                updatedElement.config.label = firstRow[labelKey]
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

                    foundPage.elements[elementIndex] = updatedElement
                }
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
            // We need to regenerate IDs for elements to avoid conflicts
            // Supports pages if present
            const newData = { ...dashboardData.data, layout: [], elements: [] } // Clear legacy root

            if (dashboardData.data.pages && dashboardData.data.pages.length > 0) {
                newData.pages = dashboardData.data.pages.map((page: any) => {
                    const pageElements = page.elements.map((el: any) => ({
                        ...el,
                        id: crypto.randomUUID(),
                        connectionId: el.connectionId // retain connection ID?? might be invalid if connections differ
                    }))

                    // Remap layout
                    const idMap = new Map()
                    page.elements.forEach((el: any, i: number) => idMap.set(el.id, pageElements[i].id))

                    const pageLayout = page.layout.map((item: any) => ({
                        ...item,
                        i: idMap.get(item.i) || item.i
                    }))

                    return {
                        ...page,
                        id: crypto.randomUUID(),
                        elements: pageElements,
                        layout: pageLayout
                    }
                })
            } else {
                // Legacy import
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

                const idMap = new Map()
                dashboardData.data.elements.forEach((el: any, index: number) => {
                    idMap.set(el.id, elements[index].id)
                })

                const layout = dashboardData.data.layout.map((item: any) => ({
                    ...item,
                    i: idMap.get(item.i) || item.i
                }))

                // Convert to page 1
                newData.pages = [{
                    id: crypto.randomUUID(),
                    title: 'Overview',
                    order: 0,
                    layout,
                    elements
                }]
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
        const elements = [] as DashboardElement[]

        // Collect all elements from all pages
        currentDashboard.value.data.pages?.forEach(p => {
            elements.push(...p.elements)
        })

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
        recentDashboards,
        currentDashboard,
        activePageId,
        activePage,
        parameters,
        isLoading,
        isSaving,
        isAnalyzing,
        analysisResult,
        error,
        loadDashboards,
        loadRecentDashboards,
        selectDashboard,
        updateParameter,
        createNewDashboard,
        saveCurrentDashboard,
        removeDashboard,
        generateShareLink,
        addElementToDashboard,
        executeElementQuery,
        refreshDashboard,
        importDashboard,
        addPage,
        removePage,
        renamePage
    }
})
