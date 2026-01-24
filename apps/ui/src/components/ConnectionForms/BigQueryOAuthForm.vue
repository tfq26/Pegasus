<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Loader2, CheckCircle2, AlertCircle, Database, FileCode, Upload, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/apiClient'
import type { ConnectionFormState } from '@/views/settings/types'
import { useAuth } from '@/composables/useAuth'

const props = defineProps<{
  connectionForm: ConnectionFormState
}>()

const { user } = useAuth()

// Get userId from token
const getUserIdFromToken = (): string => {
  const token = localStorage.getItem('auth_token')
  if (!token) return 'anonymous'
  
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return 'anonymous'
    const payload = JSON.parse(atob(parts[1]!))
    return payload.sub || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

const userId = computed(() => user.value?.id || getUserIdFromToken())

// Auth state
const isAuthenticated = ref(false)
const checkingAuth = ref(true)
const isConnecting = ref(false)

// Resource selection state
const projects = ref<any[]>([])
const selectedProject = ref<string>('')
const loadingProjects = ref(false)

const datasets = ref<any[]>([])
const selectedDataset = ref<string>('')
const loadingDatasets = ref(false)

const locations = ref([
  { value: 'US', label: 'United States (Multi-region)' },
  { value: 'EU', label: 'European Union (Multi-region)' },
  { value: 'us-central1', label: 'Iowa (us-central1)' },
  { value: 'us-east1', label: 'South Carolina (us-east1)' },
  { value: 'us-west1', label: 'Oregon (us-west1)' },
  { value: 'europe-west1', label: 'Belgium (europe-west1)' },
  { value: 'asia-east1', label: 'Taiwan (asia-east1)' },
])

const selectedLocation = ref<string>('US')

// Check if user is already authenticated with GCP
const checkAuthStatus = async () => {
  checkingAuth.value = true
  try {
    const data = await api.get<{ connected: boolean; expired?: boolean }>(
      `/api/cloud-auth/gcp/status`,
      {
        headers: {
          'x-user-id': userId.value
        }
      }
    )
    
    isAuthenticated.value = data?.connected || false
    
    if (isAuthenticated.value) {
      // Auto-load projects if authenticated
      await fetchProjects()
    }
  } catch (error) {
    console.error('[BigQueryOAuthForm] Error checking auth status:', error)
    isAuthenticated.value = false
  } finally {
    checkingAuth.value = false
  }
}

// Trigger OAuth flow
const handleConnect = () => {
  isConnecting.value = true
  
  const width = 600
  const height = 700
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  
  const popup = window.open(
    `http://localhost:3000/api/cloud-auth/gcp/init?user_id=${userId.value}`,
    'oauth-popup',
    `width=${width},height=${height},left=${left},top=${top}`
  )
  
  // Listen for OAuth success
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'gcp-oauth-success') {
      console.log('[BigQueryOAuthForm] OAuth success')
      isConnecting.value = false
      isAuthenticated.value = true
      
      window.removeEventListener('message', handleMessage)
      if (popup) popup.close()
      
      // Load projects
      fetchProjects()
    }
  }
  
  window.addEventListener('message', handleMessage)
  
  // Cleanup if popup closed manually
  const checkPopup = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkPopup)
      window.removeEventListener('message', handleMessage)
      isConnecting.value = false
    }
  }, 500)
}

// Fetch GCP projects
const fetchProjects = async () => {
  loadingProjects.value = true
  try {
    const data = await api.get<any>(
      `/api/cloud-provision/gcp/subscriptions?user_id=${userId.value}`
    )
    
    projects.value = data.subscriptions || []
    
    // Auto-select if only one
    if (projects.value.length === 1) {
      selectedProject.value = projects.value[0].id
    }
  } catch (error) {
    console.error('[BigQueryOAuthForm] Error fetching projects:', error)
  } finally {
    loadingProjects.value = false
  }
}

// Fetch BigQuery datasets
const fetchDatasets = async () => {
  if (!selectedProject.value) return
  
  loadingDatasets.value = true
  try {
    // This would need a backend endpoint to list BigQuery datasets
    const data = await api.get<any[]>(
      `/api/cloud-provision/gcp/bigquery/datasets?user_id=${userId.value}&project_id=${selectedProject.value}`
    )
    
    datasets.value = data || []
  } catch (error) {
    console.error('[BigQueryOAuthForm] Error fetching datasets:', error)
    datasets.value = []
  } finally {
    loadingDatasets.value = false
  }
}

// Watch for project changes
watch(selectedProject, (newVal) => {
  if (newVal) {
    props.connectionForm.bigquery.projectId = newVal
    fetchDatasets()
    selectedDataset.value = ''
  }
})

// Watch for dataset selection
watch(selectedDataset, (newVal) => {
  if (newVal) {
    // Store dataset info if needed
    console.log('[BigQueryOAuthForm] Selected dataset:', newVal)
  }
})

// Watch for location changes
watch(selectedLocation, (newVal) => {
  if (newVal) {
    props.connectionForm.bigquery.location = newVal
  }
})

onMounted(() => {
  checkAuthStatus()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Loading State -->
    <div v-if="checkingAuth" class="flex items-center justify-center py-8">
      <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">Checking authentication...</span>
    </div>

    <!-- Not Authenticated - Show OAuth Button -->
    <div v-else-if="!isAuthenticated" class="space-y-4">
      <div class="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-4">
        <div class="p-4 rounded-full bg-primary/10">
          <img src="/icons/google/GCP/icons8-google-cloud.svg" class="w-12 h-12" />
        </div>
        <div class="text-center">
          <h4 class="font-semibold text-lg">Connect to Google Cloud</h4>
          <p class="text-sm text-muted-foreground mt-1">
            Sign in with your Google account to access your BigQuery datasets
          </p>
        </div>
        <Button 
          @click="handleConnect" 
          :disabled="isConnecting"
          class="gap-2"
        >
          <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
          <span v-else>Sign in with Google</span>
        </Button>
      </div>
    </div>

    <!-- Authenticated - Show Resource Selection -->
    <div v-else class="space-y-4">
      <!-- Success indicator -->
      <div class="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-lg">
        <CheckCircle2 class="w-4 h-4" />
        <span>Connected to Google Cloud</span>
      </div>

      <!-- Project Selection -->
      <div class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">GCP Project</label>
        <Select v-model="selectedProject" :disabled="loadingProjects">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.displayName || project.id }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Location Selection -->
      <div v-if="selectedProject" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Location</label>
        <Select v-model="selectedLocation">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="location in locations" :key="location.value" :value="location.value">
              {{ location.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p class="text-[10px] text-muted-foreground">Choose where your BigQuery data is stored</p>
      </div>

      <!-- Dataset Selection -->
      <div v-if="selectedProject" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BigQuery Dataset (Optional)</label>
        <div v-if="loadingDatasets" class="flex items-center justify-center py-4">
          <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="datasets.length === 0" class="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No BigQuery datasets found in this project
        </div>
        <Select v-else v-model="selectedDataset">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select a dataset (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">
              <div class="flex items-center gap-2">
                <Database class="w-4 h-4" />
                {{ dataset.id }}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p class="text-[10px] text-muted-foreground">Leave empty to access all datasets in this project</p>
      </div>

      <!-- Info Box -->
      <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-muted-foreground">
        <p class="font-medium text-blue-600 mb-1">OAuth Connection</p>
        <p>Using your Google Cloud credentials from the Cloud tab. Access is managed securely through Google IAM.</p>
      </div>
    </div>
  </div>
</template>
