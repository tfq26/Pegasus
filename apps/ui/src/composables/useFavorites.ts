import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Composable for managing favorite/pinned items in the Explorer.
 * Favorites are persisted in localStorage.
 */
export function useFavorites() {
    // Store favorite IDs as a Set-like array in localStorage
    const favoriteIds = useStorage<string[]>('pegasus-favorites', [])

    /**
     * Check if an item is favorited
     */
    const isFavorite = (id: string): boolean => {
        return favoriteIds.value.includes(id)
    }

    /**
     * Toggle favorite status for an item
     */
    const toggleFavorite = (id: string) => {
        const idx = favoriteIds.value.indexOf(id)
        if (idx === -1) {
            favoriteIds.value = [...favoriteIds.value, id]
        } else {
            favoriteIds.value = favoriteIds.value.filter(fId => fId !== id)
        }
    }

    /**
     * Add an item to favorites
     */
    const addFavorite = (id: string) => {
        if (!isFavorite(id)) {
            favoriteIds.value = [...favoriteIds.value, id]
        }
    }

    /**
     * Remove an item from favorites
     */
    const removeFavorite = (id: string) => {
        favoriteIds.value = favoriteIds.value.filter(fId => fId !== id)
    }

    /**
     * Get all favorite IDs
     */
    const favorites = computed(() => favoriteIds.value)

    /**
     * Clear all favorites
     */
    const clearFavorites = () => {
        favoriteIds.value = []
    }

    /**
     * Reorder favorites by moving an item from one index to another
     */
    const reorderFavorites = (fromIndex: number, toIndex: number) => {
        const items = [...favoriteIds.value]
        const [moved] = items.splice(fromIndex, 1)
        if (moved) items.splice(toIndex, 0, moved)
        favoriteIds.value = items
    }

    return {
        favorites,
        isFavorite,
        toggleFavorite,
        addFavorite,
        removeFavorite,
        clearFavorites,
        reorderFavorites
    }
}
