import { defineStore } from 'pinia'
import { ref, computed, unref } from 'vue'
import { useConnectionStore } from './connection'
import {
    fetchDashboards,
    createDashboard,
    fetchDashboard,
    updateDashboard,
    deleteDashboard,
    shareDashboard,
    fetchRecentDashboards,
    trackDashboardAccess,
    markDashboardRead,
    fetchDashboardPermissions,
    QUERY_API_URL,
    api
} from '@/lib/api'
import { identityService } from '@/services/identityService'
import { toast } from '@/composables/useNotifications'
import { useCollaboration } from '@/composables/useCollaboration'
import { isStaticSource } from '@/lib/db-connections'

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
    error?: string
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

export interface DashboardActivity {
    id: string
    type: 'add' | 'update' | 'remove' | 'refresh'
    elementId: string
    elementTitle: string
    userId: string
    userName: string
    userProfilePicture?: string
    timestamp: number
    changes?: any
}

export const useDashboardStore = defineStore('dashboard', () => {
    const dashboards = ref<Dashboard[]>([])
    const recentDashboards = ref<Dashboard[]>([])
    const currentDashboard = ref<Dashboard | null>(null)
    const activePageId = ref<string | null>(null)
    const parameters = ref<Record<string, any>>({})
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // Permissions & Access
    const dashboardPermissions = ref<any[]>([])
    const dashboardOwner = ref<any>(null)
    const currentUserRole = ref<string | null>(null)

    const authorizedUsers = computed(() => {
        const users = [...dashboardPermissions.value]

        // Add owner if not already in list (check by ID or email)
        if (dashboardOwner.value) {
            const ownerId = dashboardOwner.value.id
            if (!users.some(u => u.user_id === ownerId || u.id === ownerId)) {
                users.unshift({
                    ...dashboardOwner.value,
                    user_id: ownerId,
                    access_level: 'owner'
                })
            }
        }

        // Normalize for mentions
        return users.map(u => ({
            id: u.user_id || u.id,
            firstName: u.first_name,
            lastName: u.last_name,
            email: u.email,
            profilePictureUrl: u.profile_picture_url,
            role: u.access_level
        }))
    })
    const isSaving = ref(false)
    const isAnalyzing = ref(false)
    const analysisResult = ref<string | null>(null)
    const activityLogs = ref<DashboardActivity[]>([])

    // Undo/Redo History
    const undoStack = ref<any[]>([])
    const redoStack = ref<any[]>([])
    const isUndoingOrRedoing = ref(false)

    const pushToHistory = () => {
        if (!currentDashboard.value || isUndoingOrRedoing.value) return

        // Deep clone the current data state
        const stateToPush = JSON.parse(JSON.stringify(currentDashboard.value.data))

        // Only push if it's different from the top of the stack
        if (undoStack.value.length > 0) {
            const lastState = undoStack.value[undoStack.value.length - 1]
            if (JSON.stringify(lastState) === JSON.stringify(stateToPush)) {
                return
            }
        }

        undoStack.value.push(stateToPush)
        // Keep stack size reasonable
        if (undoStack.value.length > 50) {
            undoStack.value.shift()
        }

        // Clear redo stack on new action
        redoStack.value = []
    }

    const undo = () => {
        if (undoStack.value.length < 2 || !currentDashboard.value) return

        isUndoingOrRedoing.value = true

        // Current state is the top of undoStack, move it to redoStack
        const currentState = undoStack.value.pop()
        redoStack.value.push(currentState)

        // Revert to the previous state
        const prevState = undoStack.value[undoStack.value.length - 1]
        currentDashboard.value.data = JSON.parse(JSON.stringify(prevState))

        isUndoingOrRedoing.value = false
        saveCurrentDashboard()
    }

    const redo = () => {
        if (redoStack.value.length === 0 || !currentDashboard.value) return

        isUndoingOrRedoing.value = true

        const nextState = redoStack.value.pop()
        undoStack.value.push(nextState)

        currentDashboard.value.data = JSON.parse(JSON.stringify(nextState))

        isUndoingOrRedoing.value = false
        saveCurrentDashboard()
    }

    const addActivityLog = (activity: Omit<DashboardActivity, 'id' | 'timestamp'>) => {
        const newActivity: DashboardActivity = {
            ...activity,
            id: crypto.randomUUID(),
            timestamp: Date.now()
        }
        activityLogs.value.unshift(newActivity)
        // Keep only last 50 activities
        if (activityLogs.value.length > 50) {
            activityLogs.value = activityLogs.value.slice(0, 50)
        }
    }

    // Move actions higher up for robust initialization
    const removeDashboard = async (id: string) => {
        try {
            await deleteDashboard(id)
            dashboards.value = dashboards.value.filter(d => d.id !== id)
            recentDashboards.value = recentDashboards.value.filter(d => d.id !== id)
            if (currentDashboard.value?.id === id) {
                currentDashboard.value = null
            }
        } catch (e: any) {
            error.value = e.message
            throw e
        }
    }

    const removeDashboards = async (ids: string[]) => {
        try {
            const items = ids.map(id => ({ type: 'dashboard', id }))
            const res = await api.post<any>('/spaces/bulk-delete', { items })

            const deletedIds = res.success || []
            dashboards.value = dashboards.value.filter(d => !deletedIds.includes(d.id))
            recentDashboards.value = recentDashboards.value.filter(d => !deletedIds.includes(d.id))

            if (currentDashboard.value && deletedIds.includes(currentDashboard.value.id)) {
                currentDashboard.value = null
            }

            return res
        } catch (e: any) {
            error.value = e.message
            throw e
        }
    }

    // Helper moved to @/lib/db-connections

    // Helper: Migrate legacy dashboard to have pages
    const migrateDashboard = (dashboard: Dashboard) => {
        if (!dashboard.data) {
            dashboard.data = { layout: [], elements: [], pages: [], parameters: {} }
        }

        // If no pages exist but we have root layout/elements, move them to Page 1
        if (dashboard.data && (!dashboard.data.pages || dashboard.data.pages.length === 0) &&
            (dashboard.data.layout?.length || dashboard.data.elements?.length)) {

            const pageId = crypto.randomUUID()
            dashboard.data.pages = [{
                id: pageId,
                title: 'Overview', // Default title
                order: 0,
                layout: dashboard.data.layout || [],
                elements: dashboard.data.elements || []
            }]

            if (dashboard.data) {
                dashboard.data.layout = []
                dashboard.data.elements = []
            }

            return pageId
        } else if (dashboard.data?.pages && dashboard.data.pages.length > 0) {
            // Already has pages
            if (dashboard.data?.pages && dashboard.data.pages.length > 0) {
                const pages = dashboard.data.pages
                pages.sort((a, b) => a.order - b.order)
                return pages[0]?.id || null
            }
            return null
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

    const loadPermissions = async (id: string) => {
        try {
            const data = await fetchDashboardPermissions(id)
            dashboardPermissions.value = data.permissions || []
            dashboardOwner.value = data.owner || null
            currentUserRole.value = data.currentUserRole || null
        } catch (e: any) {
            console.error('Failed to load permissions:', e)
            // Non-critical, so don't block
        }
    }

    const selectDashboard = async (id: string, forceRefresh = false) => {
        // Track access in backend (fire and forget)
        trackDashboardAccess(id).catch(err => console.error('Failed to track access:', err))
        markDashboardRead(id).catch(err => console.error('Failed to mark read:', err))

        // Load permissions in background
        loadPermissions(id)

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
            const dashboard = await fetchDashboard(id) // Changed from getDashboard to fetchDashboard to match original
            currentDashboard.value = dashboard
            parameters.value = dashboard.data?.parameters || {}

            // Migrate and set active page
            const pageId = migrateDashboard(currentDashboard.value!)
            // Reset active page to first page on fresh load
            activePageId.value = pageId

            // Setup Orion Live Sync if needed
            setupOrionSync()

            // Initialize History
            undoStack.value = []
            redoStack.value = []
            pushToHistory()

            // Update list item if needed
            const index = dashboards.value.findIndex(d => d.id === id)
            if (index !== -1) {
                dashboards.value[index] = { ...dashboards.value[index], ...dashboard }
            } else {
                dashboards.value.push(dashboard)
            }
            return dashboard // Added return dashboard
        } catch (e: any) { // Corrected catch block
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
        // Validation: Check for duplicate names (case-insensitive)
        const name = title.trim()
        const isDuplicate = dashboards.value.some(d => d.title.toLowerCase() === name.toLowerCase())
        if (isDuplicate) {
            throw new Error(`A dashboard with the name "${name}" already exists.`)
        }

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

        pushToHistory()

        // Calculate new order
        const maxOrder = Math.max(...currentDashboard.value.data.pages.map(p => p.order), -1)

        const newPage: DashboardPage = {
            id: crypto.randomUUID(),
            title,
            order: maxOrder + 1,
            layout: [],
            elements: []
        }

        if (currentDashboard.value?.data?.pages) {
            currentDashboard.value.data.pages.push(newPage)
        }
        activePageId.value = newPage.id
        await saveCurrentDashboard()
    }

    const removePage = async (pageId: string) => {
        if (!currentDashboard.value?.data?.pages) return
        if (currentDashboard.value.data.pages.length <= 1) {
            throw new Error("Cannot delete the last page")
        }

        pushToHistory()

        const index = currentDashboard.value.data.pages.findIndex(p => p.id === pageId)
        if (index === -1) return

        currentDashboard.value.data.pages.splice(index, 1)

        // If we deleted the active page, switch to the first available
        if (activePageId.value === pageId && currentDashboard.value?.data?.pages && currentDashboard.value.data.pages.length > 0) {
            activePageId.value = currentDashboard.value.data.pages[0]?.id || null
        }

        await saveCurrentDashboard()
    }

    const renamePage = async (pageId: string, newTitle: string) => {
        if (!currentDashboard.value?.data?.pages) return
        const page = currentDashboard.value.data.pages.find(p => p.id === pageId)
        if (page) {
            pushToHistory()
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

    // Moved up


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

            pushToHistory()

            // Ensure data exists and is migrated
            if (!dashboard.data) dashboard.data = { layout: [], elements: [], pages: [], parameters: {} } as any

            // Ensure we target the ACTIVE PAGE (or the first page if not active)
            let targetPage = dashboard.data?.pages?.find(p => p.id === activePageId.value)
            if (!targetPage) {
                // Fallback to migration logic if pages missing
                const pid = migrateDashboard(dashboard)
                targetPage = dashboard.data?.pages?.find(p => p.id === pid)!
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

            // --- Live Update: Emit Element Add ---
            const { emitElementAdd } = useCollaboration()
            emitElementAdd(dashboardId, targetPage.id, {
                ...element,
                id: newId,
                created_by_name: userName
            }, newLayoutItem)

            // Log locally
            addActivityLog({
                type: 'add',
                elementId: newId,
                elementTitle: element.title,
                userId: identityService.user?.id || 'me',
                userName: userName || 'Me',
                userProfilePicture: identityService.user?.profilePictureUrl
            })

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

        // Skip refresh for static file uploads
        const connectionStore = useConnectionStore()
        const connections = unref(connectionStore.connections)
        const conn = (connections as any[]).find((c: any) => c.id === element.connectionId)
        if (isStaticSource(conn)) {
            console.log(`[DashboardStore] Skipping execution for static source: ${element.title}`)
            return element.lastResult
        }

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

            if (foundPage) {
                const page = foundPage as any
                const elementIndex = page.elements.findIndex((el: any) => el.id === elementId)
                if (elementIndex !== -1) {
                    page.elements[elementIndex].error = undefined
                }
            }

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
                    } else if (updatedElement.type === 'table') {
                        // For tables, always use the raw result
                        updatedElement.config.data = body.result
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

                    // --- Live Update: Emit Data Refresh ---
                    const { emitElementDataRefresh } = useCollaboration()
                    if (currentDashboard.value) {
                        emitElementDataRefresh(currentDashboard.value.id, elementId, body.result)

                        // Log locally
                        addActivityLog({
                            type: 'refresh',
                            elementId,
                            elementTitle: updatedElement.title,
                            userId: identityService.user?.id || 'me',
                            userName: identityService.user?.firstName || 'Me',
                            userProfilePicture: identityService.user?.profilePictureUrl
                        })
                    }
                }
            }

            return body.result
        } catch (e: any) {
            console.error('[DashboardStore] executeElementQuery failed:', e)

            // Save error to element for UI status
            if (foundPage) {
                const page = foundPage as any
                const elementIndex = page.elements.findIndex((el: any) => el.id === elementId)
                if (elementIndex !== -1) {
                    page.elements[elementIndex].error = e.message || 'Unknown error'
                }
            }

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

        if (currentDashboard.value?.data?.pages) {
            currentDashboard.value.data.pages.forEach(p => {
                elements.push(...p.elements)
            })
        }

        // Execute all queries in parallel
        const connectionStore = useConnectionStore()
        const promises = elements
            .filter(el => {
                if (!el.query || !el.connectionId) return false

                // Skip refresh for static file uploads
                const connections = unref(connectionStore.connections)
                const conn = (connections as any[]).find((c: any) => c.id === el.connectionId)
                if (isStaticSource(conn)) {
                    console.log(`[DashboardStore] Skipping refresh for static source: ${el.title}`)
                    return false
                }
                return true
            })
            .map(el => executeElementQuery(el.id, forceRefresh))

        try {
            await Promise.all(promises)
            console.log('[DashboardStore] All elements refreshed')
        } catch (e) {
            console.error('[DashboardStore] Some elements failed to refresh:', e)
        }
    }

    const { onOrionUpdate, joinOrion } = useCollaboration()
    let orionUnsubscribe: (() => void) | null = null

    function setupOrionSync() {
        if (orionUnsubscribe) orionUnsubscribe()

        // Check if any element in the current dashboard is "live" (refreshFrequency = 0)
        const hasLiveElements = currentDashboard.value?.data?.pages?.some(p =>
            p.elements?.some(e => e.refreshFrequency === 0)
        )

        if (hasLiveElements) {
            console.log("[DashboardStore] Live elements detected, joining Orion room...")
            joinOrion()

            orionUnsubscribe = onOrionUpdate((metrics: any[]) => {
                if (!currentDashboard.value) return

                // Updates are an array of resources from Change Feed
                metrics.forEach(metric => {
                    currentDashboard.value?.data?.pages?.forEach(page => {
                        page.elements.forEach(element => {
                            if (element.refreshFrequency === 0) {
                                // If the element's query is roughly "SELECT * FROM c" or similar,
                                // we can filter/update its result set.
                                // For simplicity/robustness in a demo, we'll re-trigger the query
                                // if it's affected, OR just update the matching server if we can identify it.

                                // Simple approach: If it's a live element, just refresh it when we get ANY metric update
                                // to ensure visualization stays current.
                                // We'll throttle this if needed, but for now 1s updates are fine.
                                executeElementQuery(element.id, true)
                            }
                        })
                    })
                })
            })
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
        removeDashboards,
        generateShareLink,
        addElementToDashboard,
        executeElementQuery,
        refreshDashboard,
        importDashboard,
        isStaticSource,
        addPage,
        removePage,
        renamePage,
        authorizedUsers,
        loadPermissions,
        activityLogs,
        addActivityLog,
        undoStack,
        redoStack,
        pushToHistory,
        undo,
        redo
    }
})
