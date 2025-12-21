import { ref, onMounted, onUnmounted } from 'vue'

const isPhone = ref(false)
const isTablet = ref(false)
const isDesktop = ref(false)

const checkLayout = () => {
    const width = window.innerWidth
    isPhone.value = width < 640
    isTablet.value = width >= 640 && width < 1024
    isDesktop.value = width >= 1024
}

export function useMobileDetection() {
    onMounted(() => {
        checkLayout()
        window.addEventListener('resize', checkLayout)
    })

    onUnmounted(() => {
        window.removeEventListener('resize', checkLayout)
    })

    return {
        isPhone,
        isTablet,
        isDesktop
    }
}
