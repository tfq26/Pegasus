import { ref, computed, watch, onMounted } from 'vue'
import { toast } from '@/composables/useNotifications'
import { logOperationToBackend, fetchOperationHistory } from './api'

export type OperationStatus = 'pending' | 'running' | 'completed' | 'error'

export interface Operation {
    id: string
    label: string
    progress: number // 0-100
    status: OperationStatus
    details?: string
    error?: string
    cancellable?: boolean
    onCancel?: () => void
    startedAt: number        // Unix timestamp
    completedAt?: number     // Unix timestamp
    duration?: number        // milliseconds
    category?: 'query' | 'ai' | 'data' | 'export' | 'import'
    retryable?: boolean
    retryCount?: number
    maxRetries?: number
    onRetry?: () => Promise<void>
    groupId?: string
}

const operations = ref<Operation[]>([])
// const history = ref<Operation[]>(JSON.parse(localStorage.getItem('operation_history') || '[]'))
const history = ref<Operation[]>([])
const MAX_HISTORY = 50

// Persist to localStorage
watch(history, (newHistory) => {
    // localStorage.setItem('operation_history', JSON.stringify(newHistory.slice(0, MAX_HISTORY)))
}, { deep: true })

async function syncToBackend(op: Operation) {
    try {
        await logOperationToBackend({
            id: op.id,
            label: op.label,
            progress: op.progress,
            status: op.status,
            details: op.details,
            error: op.error,
            started_at: new Date(op.startedAt).toISOString(),
            completed_at: op.completedAt ? new Date(op.completedAt).toISOString() : undefined,
            duration: op.duration,
            category: op.category,
            group_id: op.groupId
        })
    } catch (e) {
        console.error('[Progress] Failed to sync to backend:', e)
    }
}

export function useProgress() {

    const startOperation = (id: string, label: string, options?: { cancellable?: boolean, onCancel?: () => void, groupId?: string, category?: Operation['category'] }) => {
        // Remove existing if any
        const idx = operations.value.findIndex(op => op.id === id)
        if (idx >= 0) operations.value.splice(idx, 1)

        const op: Operation = {
            id,
            label,
            progress: 0,
            status: 'pending',
            cancellable: options?.cancellable,
            onCancel: options?.onCancel,
            startedAt: Date.now(),
            groupId: options?.groupId,
            category: options?.category
        }
        operations.value.push(op)
        syncToBackend(op)
    }

    const updateOperation = (id: string, progress: number, details?: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.progress = progress
            if (progress > 0 && op.status === 'pending') op.status = 'running'
            if (details) op.details = details
            syncToBackend(op)
        }
    }

    const archiveOperation = (id: string, delay: number) => {
        setTimeout(() => {
            const idx = operations.value.findIndex(o => o.id === id)
            if (idx >= 0) {
                const op = operations.value[idx]
                if (op) {
                    operations.value.splice(idx, 1)
                    history.value.unshift(op)
                    if (history.value.length > MAX_HISTORY) {
                        history.value.pop()
                    }
                }
            }
        }, delay)
    }

    const finishOperation = (id: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.progress = 100
            op.status = 'completed'
            op.completedAt = Date.now()
            op.duration = op.completedAt - op.startedAt

            toast.success(`${op.label} completed`, {
                description: op.duration > 1000 ? `Took ${(op.duration / 1000).toFixed(1)}s` : undefined
            })

            syncToBackend(op)
            archiveOperation(id, 3000)
        }
    }

    const failOperation = (id: string, error: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.status = 'error'
            op.error = error
            op.completedAt = Date.now()
            op.duration = op.completedAt - op.startedAt

            toast.error(`${op.label} failed`, {
                description: error
            })

            syncToBackend(op)
            archiveOperation(id, 5000)
        }
    }

    const cancelOperation = (id: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            if (op.onCancel) {
                op.onCancel()
            }
            op.status = 'error'
            op.error = 'Cancelled'
            op.completedAt = Date.now()
            op.duration = op.completedAt - op.startedAt

            // Remove faster than normal error
            setTimeout(() => {
                const idx = operations.value.findIndex(o => o.id === id)
                if (idx >= 0) operations.value.splice(idx, 1)
            }, 1000)
        }
    }

    /**
     * Helper to wrap an async operation with progress tracking.
     * Automatically handles start, update (if provided), finish, and error states.
     */
    const withProgress = async <T>(
        label: string,
        fn: (update: (progress: number, details?: string) => void) => Promise<T>,
        options?: {
            cancellable?: boolean,
            onCancel?: () => void,
            retryable?: boolean,
            maxRetries?: number,
            category?: Operation['category'],
            groupId?: string
        }
    ): Promise<T> => {
        const id = `op-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        let retries = 0
        const maxRetries = options?.maxRetries ?? 3

        const execute = async (): Promise<T> => {
            startOperation(id, label, options)
            const op = operations.value.find(o => o.id === id)
            if (op) {
                op.category = options?.category
                op.retryable = options?.retryable
                op.maxRetries = maxRetries
                op.retryCount = retries
                op.groupId = options?.groupId
            }

            try {
                const result = await fn((progress, details) => {
                    updateOperation(id, progress, details)
                })
                finishOperation(id)
                return result
            } catch (error) {
                if (options?.retryable && retries < maxRetries) {
                    retries++
                    console.warn(`Operation "${label}" failed, retrying (${retries}/${maxRetries})...`)
                    return execute()
                }
                failOperation(id, error instanceof Error ? error.message : String(error))
                throw error
            }
        }

        return execute()
    }

    const activeOperations = computed(() =>
        operations.value.filter(op => op.status !== 'completed' || op.progress < 100)
    )

    const hasActive = computed(() => operations.value.length > 0)

    const groupedOperations = computed(() => {
        const groups: Record<string, { label: string, ops: Operation[], progress: number, status: OperationStatus }> = {}
        const result: (Operation | { isGroup: true, id: string, label: string, ops: Operation[], progress: number, status: OperationStatus })[] = []

        operations.value.forEach(op => {
            const gid = op.groupId
            if (gid) {
                if (!groups[gid]) {
                    groups[gid] = {
                        label: gid.startsWith('group-') ? gid.replace('group-', '') : gid,
                        ops: [],
                        progress: 0,
                        status: 'running'
                    }
                }
                const group = groups[gid]
                if (group) group.ops.push(op)
            } else {
                result.push(op)
            }
        })

        Object.entries(groups).forEach(([id, group]) => {
            const totalProgress = group.ops.reduce((acc, op) => acc + op.progress, 0) / group.ops.length
            const hasError = group.ops.some(op => op.status === 'error')
            const allCompleted = group.ops.every(op => op.status === 'completed')

            group.progress = totalProgress
            group.status = hasError ? 'error' : (allCompleted ? 'completed' : 'running')

            result.push({
                isGroup: true,
                id,
                ...group
            })
        })

        return result
    })

    const loadHistoryFromBackend = async () => {
        try {
            const backendHistory = await fetchOperationHistory(MAX_HISTORY)
            // Map backend fields to frontend fields if necessary
            const mapped = backendHistory.map((h: any) => ({
                id: h.id,
                label: h.label,
                progress: h.progress,
                status: h.status as OperationStatus,
                details: h.details,
                error: h.error,
                startedAt: new Date(h.started_at).getTime(),
                completedAt: h.completed_at ? new Date(h.completed_at).getTime() : undefined,
                duration: h.duration,
                category: h.category,
                groupId: h.group_id
            }))
            history.value = mapped
        } catch (e) {
            console.error('[Progress] Failed to load history from backend:', e)
        }
    }

    return {
        operations,
        history,
        activeOperations,
        groupedOperations,
        hasActive,
        startOperation,
        updateOperation,
        finishOperation,
        failOperation,
        cancelOperation,
        withProgress,
        loadHistoryFromBackend
    }
}
