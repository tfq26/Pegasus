import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { fetchSpaces, fetchSpaceFiles, fetchSpaceNotes, createSpace as apiCreateSpace, updateSpace as apiUpdateSpace, deleteSpace as apiDeleteSpace } from '@/lib/api'

export interface DataSpace {
    id: string
    name: string
    description?: string
    icon: string
    color: string
    is_default: boolean
    created_at: string
    updated_at: string
}

export interface SpaceFile {
    id: string
    filename: string
    file_type: string
    storage_path: string
    file_size_bytes: number
    created_at: string
}

export interface SpaceNote {
    id: string
    title: string
    content: string
    note_type: string
    created_at: string
    updated_at: string
}

export const useSpaceStore = defineStore('space', () => {
    const allSpaces = ref<DataSpace[]>([])
    const currentSpaceId = ref<string | null>(null)
    const currentSpaceFiles = ref<SpaceFile[]>([])
    const currentSpaceNotes = ref<SpaceNote[]>([])
    const loading = ref(false)
    const contextLoading = ref(false)

    const currentSpace = computed(() => {
        if (!allSpaces.value.length) return null
        return allSpaces.value.find(s => s.id === currentSpaceId.value) ||
            allSpaces.value.find(s => s.is_default) ||
            allSpaces.value[0]
    })

    async function loadSpaces() {
        loading.value = true
        try {
            const data = await fetchSpaces()
            allSpaces.value = data

            // Select default if none selected
            if (!currentSpaceId.value && allSpaces.value.length > 0) {
                const def = allSpaces.value.find(s => s.is_default) || allSpaces.value[0]
                if (def) {
                    currentSpaceId.value = def.id
                }
            } else if (currentSpaceId.value) {
                // If space is already selected (e.g. persistence), fetch context
                fetchSpaceContext()
            }
        } catch (e) {
            console.error('Failed to load spaces:', e)
        } finally {
            loading.value = false
        }
    }

    async function fetchSpaceContext() {
        if (!currentSpaceId.value) return
        contextLoading.value = true
        try {
            const [files, notes] = await Promise.all([
                fetchSpaceFiles(currentSpaceId.value),
                fetchSpaceNotes(currentSpaceId.value)
            ])
            currentSpaceFiles.value = files
            currentSpaceNotes.value = notes
        } catch (e) {
            console.error('Failed to fetch space context:', e)
        } finally {
            contextLoading.value = false
        }
    }

    function selectSpace(id: string) {
        currentSpaceId.value = id
    }

    // Auto-fetch context when space changes
    watch(currentSpaceId, () => {
        fetchSpaceContext()
    })

    async function createSpace(name: string, description?: string, icon?: string, color?: string) {
        try {
            const newSpace = await apiCreateSpace(name, description, icon, color)
            await loadSpaces()
            if (newSpace && newSpace.id) {
                selectSpace(newSpace.id)
            }
            return newSpace
        } catch (e) {
            console.error('Failed to create space:', e)
            throw e
        }
    }

    async function updateSpace(id: string, updates: Partial<DataSpace>) {
        try {
            await apiUpdateSpace(id, updates)
            await loadSpaces()
        } catch (e) {
            console.error('Failed to update space:', e)
            throw e
        }
    }

    async function deleteSpace(id: string) {
        try {
            await apiDeleteSpace(id)
            // If we deleted the current space, select another one
            if (currentSpaceId.value === id) {
                currentSpaceId.value = null
            }
            await loadSpaces()
        } catch (e) {
            console.error('Failed to delete space:', e)
            throw e
        }
    }

    return {
        allSpaces,
        currentSpaceId,
        currentSpace,
        currentSpaceFiles,
        currentSpaceNotes,
        loading,
        contextLoading,
        loadSpaces,
        fetchSpaceContext,
        selectSpace,
        createSpace,
        updateSpace,
        deleteSpace
    }
})
