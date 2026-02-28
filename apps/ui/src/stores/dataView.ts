import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDataViews, fetchDataView, apiSaveDataView, apiDeleteDataView } from '@/lib/api'

/**
 * Data View Store
 * Represents a Data View or view managed by Pegasus
 */
export interface DataView {
    id: string
    userId?: string
    name: string
    spaceId: string | null // null for global/unassigned
    data: any // Serialized Engine state (cells, styles, metadata)
    config?: any
    storageId?: string
    createdAt: string
    updatedAt: string
}

export const useDataViewStore = defineStore('dataView', () => {
    const dataViews = ref<DataView[]>([])
    const currentDataView = ref<DataView | null>(null)
    const isLoading = ref(false)

    const loadDataViews = async (spaceId: string | null) => {
        isLoading.value = true
        try {
            const data = await fetchDataViews(spaceId || undefined)
            dataViews.value = data
            return data
        } catch (error) {
            console.error('[DataViewStore] Failed to load data views:', error)
            throw error
        } finally {
            isLoading.value = false
        }
    }

    const getAllDataViews = () => dataViews.value

    const getDataView = async (id: string) => {
        try {
            const data = await fetchDataView(id)
            currentDataView.value = data
            return data
        } catch (error) {
            console.error('[DataViewStore] Failed to get data view:', error)
            throw error
        }
    }

    const saveDataView = async (view: Partial<DataView> & { name: string, data?: any, spaceId: string | null }) => {
        try {
            const saved = await apiSaveDataView(view)

            // Update local list
            const idx = dataViews.value.findIndex(s => s.id === saved.id)
            if (idx >= 0) {
                dataViews.value[idx] = saved
            } else {
                dataViews.value.push(saved)
            }

            return saved
        } catch (error) {
            console.error('[DataViewStore] Failed to save data view:', error)
            throw error
        }
    }

    const deleteDataView = async (id: string) => {
        try {
            await apiDeleteDataView(id)
            dataViews.value = dataViews.value.filter(s => s.id !== id)
        } catch (error) {
            console.error('[DataViewStore] Failed to delete data view:', error)
            throw error
        }
    }

    return {
        dataViews,
        currentDataView,
        isLoading,
        loadDataViews,
        getAllDataViews,
        getDataView,
        saveDataView,
        deleteDataView
    }
})
