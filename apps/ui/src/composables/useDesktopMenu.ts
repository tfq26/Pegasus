/**
 * useDesktopMenu
 *
 * Handles desktop integration menus — right-click context menu suppression
 * in Tauri and browser-based desktop menu interactions.
 */
import { onMounted, onUnmounted } from 'vue'

const suppressContextMenu = (e: MouseEvent) => {
  if (e.button === 2) {
    e.preventDefault()
  }
}

export const useDesktopMenu = () => {
  onMounted(() => {
    document.addEventListener('contextmenu', suppressContextMenu)
  })

  onUnmounted(() => {
    document.removeEventListener('contextmenu', suppressContextMenu)
  })
}
