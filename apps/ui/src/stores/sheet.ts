import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStorage } from '@vueuse/core'

/**
 * Interface for a Sheet entity
 * Represents a spreadsheet managed by Pegasus (not a direct DB connection view)
 */
export interface Sheet {
    id: string
    name: string
    spaceId: string | null // null for global/unassigned
    data: any // Serialized Engine state (cells, styles, metadata)
    createdAt: string
    updatedAt: string
}

export const useSheetStore = defineStore('sheet', () => {
    // Persist sheets in localStorage for now (simulating backend)
    // In production, this would sync with a backend API
    const sheets = useStorage<Sheet[]>('pegasus-sheets', [])

    const loadSheets = async (spaceId: string | null) => {
        // Since it's local storage, no async fetch needed really, 
        // but we keep signature async for future API integration
        return sheets.value.filter(s => s.spaceId === spaceId)
    }

    const getAllSheets = () => sheets.value

    const getSheet = (id: string) => {
        return sheets.value.find(s => s.id === id)
    }

    const saveSheet = async (sheet: Partial<Sheet> & { name: string, data: any, spaceId: string | null }) => {
        const existingIndex = sheets.value.findIndex(s => s.id === sheet.id)

        const now = new Date().toISOString()

        if (existingIndex >= 0) {
            // Update
            sheets.value[existingIndex] = {
                ...sheets.value[existingIndex],
                ...sheet,
                updatedAt: now
            }
            return sheets.value[existingIndex]
        } else {
            // Create
            const newSheet: Sheet = {
                id: (sheet.id ?? crypto.randomUUID()) as string,
                name: sheet.name,
                spaceId: sheet.spaceId,
                data: sheet.data,
                createdAt: now,
                updatedAt: now
            }
            sheets.value.push(newSheet)
            return newSheet
        }
    }

    const deleteSheet = async (id: string) => {
        const index = sheets.value.findIndex(s => s.id === id)
        if (index >= 0) {
            sheets.value.splice(index, 1)
        }
    }

    return {
        sheets,
        loadSheets,
        getAllSheets,
        getSheet,
        saveSheet,
        deleteSheet
    }
})
