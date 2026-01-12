<template>
  <div class="min-h-screen text-foreground p-8">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-foreground">Admin Panel</h1>
        <p class="text-muted-foreground mt-2">Manage experimental access and system audit logs</p>
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
      <LoadingScreen 
        v-else-if="loading" 
        title="Accessing Admin Chamber"
        message="Verifying credentials and loading restricted metrics..."
      />

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
        
        <!-- Tabs -->
        <div class="flex items-center gap-2 border-b border-border mb-6">
            <button 
                @click="activeTab = 'requests'"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors hover:text-foreground"
                :class="activeTab === 'requests' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'"
            >
                Access Requests
            </button>
            <button 
                @click="activeTab = 'audit'"
                class="px-4 py-2 text-sm font-medium border-b-2 transition-colors hover:text-foreground"
                :class="activeTab === 'audit' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'"
            >
                Audit Logs
            </button>
        </div>

        <!-- Audit Logs Section -->
        <div v-if="activeTab === 'audit'" class="space-y-4">
             <div class="flex items-center justify-between">
                 <h2 class="text-lg font-semibold">System Audit Logs</h2>
                 <button 
                    @click="exportLogs"
                    class="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors border border-border flex items-center gap-2"
                 >
                    <Download class="w-4 h-4" />
                    Export CSV
                 </button>
             </div>
             
             <div class="rounded-xl border border-border bg-card overflow-hidden">
                 <div class="max-h-[600px] overflow-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-muted/30 text-muted-foreground sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th class="p-3 font-medium">Time</th>
                                <th class="p-3 font-medium">User</th>
                                <th class="p-3 font-medium">Action</th>
                                <th class="p-3 font-medium">Resource</th>
                                <th class="p-3 font-medium">Details</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-border">
                            <tr v-if="auditLoading" class="animate-pulse">
                                <td colspan="5" class="p-4 text-center text-muted-foreground">Loading logs...</td>
                            </tr>
                            <tr v-else-if="auditLogs.length === 0">
                                <td colspan="5" class="p-8 text-center text-muted-foreground">No logs found</td>
                            </tr>
                            <tr v-for="log in auditLogs" :key="log.id" class="hover:bg-muted/10 transition-colors bg-card">
                                <td class="p-3 whitespace-nowrap text-muted-foreground/80">{{ new Date(log.created_at).toLocaleString() }}</td>
                                <td class="p-3 font-mono text-xs">{{ log.user_id?.split(':').pop() }}</td>
                                <td class="p-3">
                                    <span class="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                                        {{ log.action }}
                                    </span>
                                </td>
                                <td class="p-3 text-muted-foreground">{{ log.resource_type }}</td>
                                <td class="p-3 text-muted-foreground truncate max-w-[200px]" :title="JSON.stringify(log.details)">
                                    {{ log.details ? JSON.stringify(log.details) : '-' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                 </div>
             </div>
        </div>

        <!-- Requests Section -->
        <div v-else class="rounded-xl border border-border bg-card overflow-hidden">
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
import { ref, onMounted, watch } from 'vue'
import LoadingScreen from '@/components/ui/LoadingScreen.vue'
import { toast } from '@/composables/useNotifications'
import { fetchOperationHistory } from '@/lib/api'
import { Download } from 'lucide-vue-next'

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
const activeTab = ref<'requests' | 'audit'>('requests')

// Audit
const auditLogs = ref<any[]>([])
const auditLoading = ref(false)

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
    loadAuditLogs()
  }
  loading.value = false
})

const loadAuditLogs = async () => {
    auditLoading.value = true
    try {
        const logs = await fetchOperationHistory(100)
        auditLogs.value = logs as any[]
    } catch (e) {
        console.error("Failed to load audit logs", e)
    } finally {
        auditLoading.value = false
    }
}

watch(activeTab, (val) => {
    if (val === 'audit' && auditLogs.value.length === 0) {
        loadAuditLogs()
    }
})

const exportLogs = () => {
    if (!auditLogs.value.length) return
    
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Details']
    const csvContent = [
        headers.join(','),
        ...auditLogs.value.map(log => {
            return [
                `"${new Date(log.created_at).toISOString()}"`,
                `"${log.user_id}"`,
                `"${log.action}"`,
                `"${log.resource_type}"`,
                `"${(JSON.stringify(log.details || {})).replace(/"/g, '""')}"` // Escape quotes
            ].join(',')
        })
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
}
</script>
