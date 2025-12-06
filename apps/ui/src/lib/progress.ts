import { ref, computed } from 'vue'

export type OperationStatus = 'pending' | 'running' | 'completed' | 'error'

export interface Operation {
    id: string
    label: string
    progress: number // 0-100
    status: OperationStatus
    details?: string
    error?: string
}

const operations = ref<Operation[]>([])

export function useProgress() {

    const startOperation = (id: string, label: string) => {
        // Remove existing if any
        const idx = operations.value.findIndex(op => op.id === id)
        if (idx >= 0) operations.value.splice(idx, 1)

        operations.value.push({
            id,
            label,
            progress: 0,
            status: 'pending'
        })
    }

    const updateOperation = (id: string, progress: number, details?: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.progress = progress
            if (progress > 0 && op.status === 'pending') op.status = 'running'
            if (details) op.details = details
            // Auto complete if 100? Maybe not, start/finish explicit is better
        }
    }

    const finishOperation = (id: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.progress = 100
            op.status = 'completed'
            // Remove after short delay
            setTimeout(() => {
                const idx = operations.value.findIndex(o => o.id === id)
                if (idx >= 0) operations.value.splice(idx, 1)
            }, 3000)
        }
    }

    const failOperation = (id: string, error: string) => {
        const op = operations.value.find(o => o.id === id)
        if (op) {
            op.status = 'error'
            op.error = error
            // Keep error visible for longer
            setTimeout(() => {
                const idx = operations.value.findIndex(o => o.id === id)
                if (idx >= 0) operations.value.splice(idx, 1)
            }, 5000)
        }
    }

    const activeOperations = computed(() =>
        operations.value.filter(op => op.status !== 'completed' || op.progress < 100)
    )

    const hasActive = computed(() => operations.value.length > 0)

    return {
        operations,
        activeOperations,
        hasActive,
        startOperation,
        updateOperation,
        finishOperation,
        failOperation
    }
}
