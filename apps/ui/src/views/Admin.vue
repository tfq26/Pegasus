<template>
  <div class="min-h-screen bg-background text-foreground p-8">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-foreground">Admin Panel</h1>
        <p class="text-muted-foreground mt-2">Manage experimental access requests</p>
      </div>

      <!-- Not Admin Message -->
      <div v-if="!isAdmin && !loading" class="p-8 rounded-xl border border-red-500/20 bg-red-500/5 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto text-red-500 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 class="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p class="text-muted-foreground">You don't have admin privileges.</p>
        <router-link to="/" class="inline-block mt-4 text-primary hover:underline">
          Return to Home
        </router-link>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="flex items-center justify-center py-16">
        <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>

      <!-- Admin Content -->
      <div v-else class="space-y-6">
        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4">
          <div class="p-4 rounded-xl bg-card border border-border">
            <p class="text-sm text-muted-foreground">Pending Requests</p>
            <p class="text-2xl font-bold text-amber-500">{{ requests.length }}</p>
          </div>
          <div class="p-4 rounded-xl bg-card border border-border">
            <p class="text-sm text-muted-foreground">Status</p>
            <p class="text-2xl font-bold text-emerald-500">Active</p>
          </div>
          <div class="p-4 rounded-xl bg-card border border-border">
            <p class="text-sm text-muted-foreground">Your Role</p>
            <p class="text-2xl font-bold text-primary">Admin</p>
          </div>
        </div>

        <!-- Requests Section -->
        <div class="rounded-xl border border-border bg-card overflow-hidden">
          <div class="p-4 border-b border-border bg-muted/30">
            <h2 class="text-lg font-semibold">Pending Experimental Access Requests</h2>
          </div>

          <!-- Empty State -->
          <div v-if="requests.length === 0" class="p-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p class="text-muted-foreground">No pending requests</p>
          </div>

          <!-- Request List -->
          <div v-else class="divide-y divide-border">
            <div 
              v-for="request in requests" 
              :key="request.id"
              class="p-4 hover:bg-muted/30 transition-colors"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-medium text-foreground">{{ request.email }}</span>
                    <span class="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      Pending
                    </span>
                  </div>
                  <p class="text-sm text-muted-foreground mb-2">{{ request.reason }}</p>
                  <p class="text-xs text-muted-foreground/60">
                    Requested {{ formatDate(request.requested_at) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button 
                    @click="approveRequest(request)"
                    :disabled="processingId === request.id"
                    class="px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-sm font-medium border border-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {{ processingId === request.id ? 'Processing...' : 'Approve' }}
                  </button>
                  <button 
                    @click="rejectRequest(request)"
                    :disabled="processingId === request.id"
                    class="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 text-sm font-medium border border-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="rounded-xl border border-border bg-card p-4">
          <h3 class="font-semibold mb-4">Quick Actions</h3>
          <div class="flex gap-2">
            <button 
              @click="loadRequests"
              class="px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium border border-primary/20 transition-colors"
            >
              Refresh Requests
            </button>
            <router-link 
              to="/settings"
              class="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium border border-border transition-colors"
            >
              Back to Settings
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { toast } from '@/composables/useNotifications'

const API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000'

interface ExperimentalRequest {
  id: string
  user: string
  email: string
  reason: string
  status: string
  requested_at: number
}

const isAdmin = ref(false)
const loading = ref(true)
const requests = ref<ExperimentalRequest[]>([])
const processingId = ref<string | null>(null)

const checkAdmin = async () => {
  try {
    const response = await fetch(`${API_URL}/api/admin/check`, {
      credentials: 'include'
    })
    const data = await response.json()
    isAdmin.value = data.isAdmin
  } catch (error) {
    console.error('Failed to check admin status:', error)
    isAdmin.value = false
  }
}

const loadRequests = async () => {
  if (!isAdmin.value) return
  
  try {
    const response = await fetch(`${API_URL}/api/admin/experimental/requests`, {
      credentials: 'include'
    })
    
    if (response.ok) {
      const data = await response.json()
      requests.value = data.requests || []
    }
  } catch (error) {
    console.error('Failed to load requests:', error)
    toast.error('Failed to load requests')
  }
}

const approveRequest = async (request: ExperimentalRequest) => {
  processingId.value = request.id
  
  try {
    // Extract user ID from the record reference (e.g., "user:abc123" -> "abc123")
    const userId = request.user.toString().replace('user:', '')
    
    const response = await fetch(`${API_URL}/api/admin/experimental/grant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId })
    })
    
    if (response.ok) {
      toast.success(`Access granted to ${request.email}`)
      await loadRequests() // Refresh list
    } else {
      const error = await response.json()
      toast.error(error.error || 'Failed to approve request')
    }
  } catch (error) {
    console.error('Failed to approve request:', error)
    toast.error('Failed to approve request')
  } finally {
    processingId.value = null
  }
}

const rejectRequest = async (request: ExperimentalRequest) => {
  processingId.value = request.id
  
  try {
    const response = await fetch(`${API_URL}/api/admin/experimental/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId: request.id })
    })
    
    if (response.ok) {
      toast.success('Request rejected')
      await loadRequests() // Refresh list
    } else {
      const error = await response.json()
      toast.error(error.error || 'Failed to reject request')
    }
  } catch (error) {
    console.error('Failed to reject request:', error)
    toast.error('Failed to reject request')
  } finally {
    processingId.value = null
  }
}

const formatDate = (timestamp: number) => {
  if (!timestamp) return 'Unknown'
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`
  
  return date.toLocaleDateString()
}

onMounted(async () => {
  await checkAdmin()
  if (isAdmin.value) {
    await loadRequests()
  }
  loading.value = false
})
</script>
