<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-vue-next'
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

// AWS regions
const regions = ref([
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'EU (Ireland)' },
  { value: 'eu-central-1', label: 'EU (Frankfurt)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
])

const selectedRegion = ref<string>('')
const loadingTables = ref(false)
const dynamoTables = ref<any[]>([])
const selectedTable = ref<string>('')

// Check if user is already authenticated with AWS
const checkAuthStatus = async () => {
  checkingAuth.value = true
  try {
    const data = await api.get<{ connected: boolean; expired?: boolean }>(
      `/api/cloud-auth/aws/status`,
      {
        headers: {
          'x-user-id': userId.value
        }
      }
    )
    
    isAuthenticated.value = data?.connected || false
    
    // Auto-select default region if authenticated
    if (isAuthenticated.value && !selectedRegion.value) {
      selectedRegion.value = 'us-east-1'
    }
  } catch (error) {
    console.error('[DynamoDBOAuthForm] Error checking auth status:', error)
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
    `http://localhost:3000/api/cloud-auth/aws/init?user_id=${userId.value}`,
    'oauth-popup',
    `width=${width},height=${height},left=${left},top=${top}`
  )
  
  // Listen for OAuth success
  const handleMessage = (event: MessageEvent) => {
    if (event.data.type === 'aws-oauth-success') {
      console.log('[DynamoDBOAuthForm] OAuth success')
      isConnecting.value = false
      isAuthenticated.value = true
      
      window.removeEventListener('message', handleMessage)
      if (popup) popup.close()
      
      // Set default region
      selectedRegion.value = 'us-east-1'
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

// Fetch DynamoDB tables in selected region
const fetchDynamoDBTables = async () => {
  if (!selectedRegion.value) return
  
  loadingTables.value = true
  try {
    // This would need a backend endpoint to list DynamoDB tables
    // For now, we'll use the resources endpoint and filter
    const data = await api.get<any[]>(
      `/api/cloud-provision/aws/dynamodb/tables?user_id=${userId.value}&region=${selectedRegion.value}`
    )
    
    dynamoTables.value = data || []
  } catch (error) {
    console.error('[DynamoDBOAuthForm] Error fetching DynamoDB tables:', error)
    dynamoTables.value = []
  } finally {
    loadingTables.value = false
  }
}

// Watch for region changes
watch(selectedRegion, (newVal) => {
  if (newVal && isAuthenticated.value) {
    props.connectionForm.dynamodb.region = newVal
    fetchDynamoDBTables()
    selectedTable.value = ''
  }
})

// Watch for table selection
watch(selectedTable, (newVal) => {
  if (newVal) {
    // Store the table name in a custom field or use it for connection
    // DynamoDB doesn't have a single "database" concept, tables are accessed directly
    console.log('[DynamoDBOAuthForm] Selected table:', newVal)
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
          <img src="/icons/aws/aws-colored-black-text.svg" class="w-12 h-12" />
        </div>
        <div class="text-center">
          <h4 class="font-semibold text-lg">Connect to AWS</h4>
          <p class="text-sm text-muted-foreground mt-1">
            Sign in with your AWS account to access your DynamoDB tables
          </p>
        </div>
        <Button 
          @click="handleConnect" 
          :disabled="isConnecting"
          class="gap-2"
        >
          <Loader2 v-if="isConnecting" class="w-4 h-4 animate-spin" />
          <span v-else>Sign in with AWS</span>
        </Button>
      </div>
    </div>

    <!-- Authenticated - Show Resource Selection -->
    <div v-else class="space-y-4">
      <!-- Success indicator -->
      <div class="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-2 rounded-lg">
        <CheckCircle2 class="w-4 h-4" />
        <span>Connected to AWS</span>
      </div>

      <!-- Region Selection -->
      <div class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AWS Region</label>
        <Select v-model="selectedRegion">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="region in regions" :key="region.value" :value="region.value">
              {{ region.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- DynamoDB Table Selection -->
      <div v-if="selectedRegion" class="space-y-2">
        <label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DynamoDB Table (Optional)</label>
        <div v-if="loadingTables" class="flex items-center justify-center py-4">
          <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="dynamoTables.length === 0" class="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          No DynamoDB tables found in this region
        </div>
        <Select v-else v-model="selectedTable">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="Select a table (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="table in dynamoTables" :key="table.name" :value="table.name">
              <div class="flex items-center gap-2">
                <Database class="w-4 h-4" />
                {{ table.name }}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p class="text-[10px] text-muted-foreground">Leave empty to access all tables in this region</p>
      </div>

      <!-- Info Box -->
      <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-muted-foreground">
        <p class="font-medium text-blue-600 mb-1">OAuth Connection</p>
        <p>Using your AWS credentials from the Cloud tab. Access keys are managed securely by AWS IAM.</p>
      </div>
    </div>
  </div>
</template>
