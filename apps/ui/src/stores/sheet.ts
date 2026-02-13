
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchSheets, fetchSheet, apiSaveSheet, apiDeleteSheet } from '@/lib/api'

/**
 * Interface for a Sheet entity
 * Represents a spreadsheet managed by Pegasus (not a direct DB connection view)
 */
export interface Sheet {
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

export const useSheetStore = defineStore('sheet', () => {
    const sheets = ref<Sheet[]>([])
    const currentSheet = ref<Sheet | null>(null)
    const isLoading = ref(false)

    const loadSheets = async (spaceId: string | null) => {
        isLoading.value = true
        try {
            const data = await fetchSheets(spaceId || undefined)
            sheets.value = data
            return data
        } catch (error) {
            console.error('[SheetStore] Failed to load sheets:', error)
            throw error
        } finally {
            isLoading.value = false
        }
    }

    const getAllSheets = () => sheets.value

    const getSheet = async (id: string) => {
        try {
            const data = await fetchSheet(id)
            currentSheet.value = data
            return data
        } catch (error) {
            console.error('[SheetStore] Failed to get sheet:', error)
            throw error
        }
    }

    const saveSheet = async (sheet: Partial<Sheet> & { name: string, data?: any, spaceId: string | null }) => {
        try {
            const saved = await apiSaveSheet(sheet)

            // Update local list
            const idx = sheets.value.findIndex(s => s.id === saved.id)
            if (idx >= 0) {
                sheets.value[idx] = saved
            } else {
                sheets.value.push(saved)
            }

            return saved
        } catch (error) {
            console.error('[SheetStore] Failed to save sheet:', error)
            throw error
        }
    }

    const deleteSheet = async (id: string) => {
        try {
            await apiDeleteSheet(id)
            sheets.value = sheets.value.filter(s => s.id !== id)
        } catch (error) {
            console.error('[SheetStore] Failed to delete sheet:', error)
            throw error
        }
    }

    return {
        sheets,
        currentSheet,
        isLoading,
        loadSheets,
        getAllSheets,
        getSheet,
        saveSheet,
        deleteSheet
    }
})
