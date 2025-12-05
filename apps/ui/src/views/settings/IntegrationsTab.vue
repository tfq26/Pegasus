<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ExternalLink, CheckCircle2, XCircle } from 'lucide-vue-next'

const microsoftConnected = ref(false)
const kustoEmail = ref('')

onMounted(() => {
  // Check if user has Microsoft account linked
  // This would typically come from your backend
  const storedEmail = localStorage.getItem('kusto_microsoft_email')
  if (storedEmail) {
    microsoftConnected.value = true
    kustoEmail.value = storedEmail
  }
})

const connectMicrosoft = () => {
  // This would redirect to Microsoft OAuth flow
  // For now, we'll simulate it
  window.open('https://login.microsoftonline.com/common/oauth2/v2.0/authorize', '_blank')
}

const disconnectMicrosoft = () => {
  microsoftConnected.value = false
  kustoEmail.value = ''
  localStorage.removeItem('kusto_microsoft_email')
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-foreground mb-2">Linked Accounts</h2>
      <p class="text-sm text-muted-foreground">Connect your Microsoft account to access Azure Data Explorer (Kusto) databases.</p>
    </div>

    <!-- Microsoft Account Card -->
    <div class="rounded-xl border border-border bg-card p-6 hover:border-primary/50 transition-colors">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-4">
          <div class="p-3 rounded-lg bg-primary/10 border border-primary/20">
            <svg class="w-8 h-8" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 0h11v11H0z" fill="#f25022"/>
              <path d="M12 0h11v11H12z" fill="#00a4ef"/>
              <path d="M0 12h11v11H0z" fill="#7fba00"/>
              <path d="M12 12h11v11H12z" fill="#ffb900"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-foreground flex items-center gap-2">
              Microsoft Account
              <CheckCircle2 v-if="microsoftConnected" class="w-5 h-5 text-emerald-500" />
              <XCircle v-else class="w-5 h-5 text-muted-foreground" />
            </h3>
            <p class="text-sm text-muted-foreground mt-1">
              {{ microsoftConnected ? kustoEmail : 'Not connected' }}
            </p>
          </div>
        </div>

        <button
          v-if="!microsoftConnected"
          @click="connectMicrosoft"
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <ExternalLink class="w-4 h-4" />
          Connect
        </button>
        <button
          v-else
          @click="disconnectMicrosoft"
          class="px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm font-medium hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
        >
          Disconnect
        </button>
      </div>

      <div v-if="microsoftConnected" class="mt-4 pt-4 border-t border-border">
        <p class="text-xs text-muted-foreground">
          This account is used for authenticating with Azure Data Explorer (Kusto) databases. You can now add Kusto connections in the Database Connections tab.
        </p>
      </div>
      <div v-else class="mt-4 pt-4 border-t border-border">
        <p class="text-xs text-muted-foreground">
          Connect your Microsoft account to enable Azure Data Explorer (Kusto) integration. This allows you to query your Kusto databases directly from Pegasus.
        </p>
      </div>
    </div>
  </div>
</template>
