<template>
  <div class="h-screen w-screen flex flex-col items-center justify-center bg-black text-white p-6">
    <div class="text-center space-y-6">
      <div v-if="loading" class="space-y-4">
        <div class="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <h2 class="text-2xl font-bold">Completing Sign-In...</h2>
        <p class="text-muted-foreground">Synchronizing with Pegasus...</p>
      </div>
      
      <div v-else-if="error" class="space-y-4">
        <div class="text-red-500 text-6xl">✕</div>
        <h2 class="text-2xl font-bold text-red-500">Authentication Failed</h2>
        <p class="text-muted-foreground">{{ error }}</p>
        <button @click="closeWindow" class="px-6 py-2 bg-white text-black rounded-lg font-bold">Close Window</button>
      </div>
      
      <div v-else class="space-y-4">
        <div class="text-green-500 text-6xl">✓</div>
        <h2 class="text-2xl font-bold text-green-500">Sign-In Successful!</h2>
        <p class="text-muted-foreground">Connected as <span class="text-primary font-bold">{{ email }}</span></p>
        <p class="text-xs text-muted-foreground">This window will close automatically.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const loading = ref(true)
const error = ref<string | null>(null)
const email = ref<string | null>(null)

const closeWindow = async () => {
    try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().close()
    } catch (e) {
        window.close()
    }
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const emailParam = params.get('email')
  
  if (!token) {
    loading.value = false
    error.value = 'No authentication token received.'
    return
  }

  try {
    // Store token in localStorage (Same Origin as main window!)
    localStorage.setItem('pending_auth_token', token)
    if (emailParam) {
        localStorage.setItem('pending_auth_user', JSON.stringify({ email: emailParam }))
        email.value = emailParam
    }
    
    loading.value = false
    
    // Auto-close after a short delay
    setTimeout(() => {
        closeWindow()
    }, 1500)
    
  } catch (e) {
    loading.value = false
    error.value = 'Failed to store authentication data.'
  }
})
</script>
