import { ref, onMounted, onUnmounted } from 'vue'

const isMobile = ref(false)

const checkMobile = () => {
    // Check if viewport width is mobile-sized
    const width = window.innerWidth
    isMobile.value = width < 768 // Tailwind's md breakpoint
}

export function useMobileDetection() {
    onMounted(() => {
        checkMobile()
        window.addEventListener('resize', checkMobile)
    })

    onUnmounted(() => {
        window.removeEventListener('resize', checkMobile)
    })

    return {
        isMobile
    }
}
