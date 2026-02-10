import { markRaw } from 'vue'
import { toast } from 'vue-sonner'
import ProgressToast from '@/components/ui/ProgressToast.vue'

export interface ProgressToastHandle {
    id: string | number
    update: (progress: number, message?: string, description?: string) => void
    success: (message?: string, description?: string) => void
    error: (message?: string, description?: string) => void
    dismiss: () => void
}

/**
 * Show a toast with a progress bar
 */
export function showProgressToast(
    initialMessage: string,
    initialProgress: number = 0,
    initialDescription?: string
): ProgressToastHandle {
    const id = toast.custom(markRaw(ProgressToast), {
        componentProps: {
            message: initialMessage,
            progress: initialProgress,
            description: initialDescription,
            status: 'loading'
        },
        duration: Infinity, // Keep it open until dismissed or completed
    })

    // Immediately update with the ID so the component can dismiss itself
    toast.custom(markRaw(ProgressToast), {
        id,
        componentProps: {
            id,
            message: initialMessage,
            progress: initialProgress,
            description: initialDescription,
            status: 'loading'
        }
    })

    return {
        id,
        update: (progress: number, message?: string, description?: string) => {
            toast.custom(markRaw(ProgressToast), {
                id,
                componentProps: {
                    id,
                    message: message || initialMessage,
                    progress,
                    description,
                    status: 'loading'
                }
            })
        },
        success: (message?: string, description?: string) => {
            toast.custom(markRaw(ProgressToast), {
                id,
                componentProps: {
                    id,
                    message: message || 'Success',
                    progress: 100,
                    description,
                    status: 'success'
                },
                // We'll also call an explicit dismiss after a timeout 
                // because sometimes vue-sonner updates to Infinity-created toasts don't reset timer
                duration: 4000
            })
            setTimeout(() => toast.dismiss(id), 4000)
        },
        error: (message?: string, description?: string) => {
            toast.custom(markRaw(ProgressToast), {
                id,
                componentProps: {
                    id,
                    message: message || 'Error',
                    progress: 100,
                    description,
                    status: 'error'
                },
                duration: 8000
            })
            setTimeout(() => toast.dismiss(id), 8000)
        },
        dismiss: () => toast.dismiss(id)
    }
}
