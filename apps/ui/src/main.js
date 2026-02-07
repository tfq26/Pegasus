import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router' // Keep router import
import { usePisces } from './composables/usePisces' // New import for usePisces

const app = createApp(App)
const pinia = createPinia() // New line for pinia instance

app.use(pinia) // Use the named pinia instance
app.use(router)

// Initialize Global Error Handler (Pisces) // Updated comment
const { initGlobalErrorHandler } = usePisces() // New line to destructure initGlobalErrorHandler
initGlobalErrorHandler(app) // New line to call initGlobalErrorHandler with the app instance

app.mount('#app')
