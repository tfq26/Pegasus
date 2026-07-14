<script setup lang="ts">
import { ref, computed, onMounted, onErrorCaptured, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePegasusTheme } from '@/composables/usePegasusTheme'
import { Toaster } from '@/components/ui/sonner'
import { identityService } from '@/services/identityService'
import { entitlementService } from '@/services/entitlementService'
import { useAuth } from '@/composables/useAuth'
import { usePrefetch } from '@/composables/usePrefetch'
import { useConnectionStore } from '@/stores/connection'
import { useDesktopMenu } from '@/composables/useDesktopMenu'
import { usePlatform, isOnline as isOnlineRef } from '@/composables/usePlatform'
import { usePreferredDark } from '@vueuse/core'
import { useFeatureFlags } from '@/composables/useFeatureFlags'
import { usePisces } from '@/composables/usePisces'
import ErrorPage from '@/views/ErrorPage.vue'
import AILoadingIsland from '@/components/AILoadingIsland.vue'
import PiscesDialog from '@/components/Support/PiscesDialog.vue'
import NotificationCenter from '@/components/NotificationCenter.vue'
import GlobalProgressBar from '@/components/GlobalProgressBar.vue'
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  User,
  Settings,
  CircleHelp,
  LogOut,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  ChevronRight,
  Plus,
  Coins,
  Wallet,
  Search
} from 'lucide-vue-next'
import 'vue-sonner/style.css'

const { isTauri } = usePlatform()
const { setUser } = useFeatureFlags()
const { triggerAutoReport } = usePisces()
const route = useRoute()
const router = useRouter()
const { user, logout } = useAuth()
const connectionStore = useConnectionStore()
const isOnline = isOnlineRef

// Dynamic Account sub-tree expand/collapse states
const bankingOpen = ref(true)
const investmentsOpen = ref(true)
const assetsOpen = ref(false)

// Global Error State
const capturedError = ref<{
    code: string | number
    title: string
    message: string
    details: string
    fatal: boolean
} | null>(null)

// Error Handling
const handleGlobalError = (error: any, info?: string) => {
    console.error('[App] Global error captured:', error, info)
    if (error?.message?.includes('ResizeObserver')) return false
    if (error?.message?.includes('VersionRetrievalFailure')) return false
    if (error?.message?.includes('ERR_CONNECTION_REFUSED')) return false
    if (String(error).includes('VersionRetrievalFailure')) return false
    if (error === null && info === 'Window Error') return false

    capturedError.value = {
        code: error?.code || 'RUNTIME_ERR',
        title: 'Application Error',
        message: error?.message || (error === null ? 'Unknown Window Error' : String(error)),
        details: `${error?.stack || String(error)}\n\nContext: ${info || 'Global Scope'}`,
        fatal: true
    }

    if (!error?.message?.includes('ResizeObserver')) {
        triggerAutoReport(error);
    }
    
    return false
}

onErrorCaptured((err, instance, info) => {
    return handleGlobalError(err, info)
})

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    handleGlobalError(event.reason, 'Unhandled Promise Rejection')
}

const handleWindowError = (event: ErrorEvent) => {
    handleGlobalError(event.error, 'Window Error')
}

// Routes that should be minimal (no navbar/sidebars)
// Keep /signin in the full app shell so the sidebar stays visible.
const minimalRoutes = ['/auth/device', '/local-auth']
const isMinimalRoute = computed(() => {
  if (route.path.includes('/fullscreen')) return true
  return minimalRoutes.some(r => route.path === r || route.path.startsWith(r + '/'))
})

usePrefetch()
useDesktopMenu()
const { fetchUser } = useAuth()

onMounted(async () => {
  if (!(isTauri.value && !navigator.onLine)) {
    await identityService.init()
    if (identityService.isAuthenticated) {
        setUser(identityService.user as any)
        entitlementService.fetch()
        connectionStore.loadConnections()
    }
  } else {
    connectionStore.loadConnections()
  }

  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  window.addEventListener('error', handleWindowError)
})

const themeMode = usePegasusTheme()
const preferredDark = usePreferredDark()
const activeToastTheme = computed(() =>
  themeMode.value === 'auto' ? (preferredDark.value ? 'dark' : 'light') : themeMode.value
)

const toggleTheme = () => {
  if (themeMode.value === 'auto') {
    themeMode.value = 'light'
  } else if (themeMode.value === 'light') {
    themeMode.value = 'dark'
  } else {
    themeMode.value = 'auto'
  }
}

// Compute active secondary view based on current path
const activeView = computed(() => {
  if (route.path.startsWith('/dashboard') || route.path === '/') return 'dashboard'
  if (route.path.startsWith('/query') || route.path.startsWith('/chat')) return 'chat'
  if (route.path.startsWith('/settings') || route.path.startsWith('/profile')) return 'settings'
  return 'none'
})

const handleLogout = () => {
  logout()
  router.push('/signin')
}

const handleNewChat = () => {
  router.push('/query')
}

onUnmounted(() => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    window.removeEventListener('error', handleWindowError)
})
</script>

<template>
  <!-- Minimal layout for login & auth screens -->
  <div v-if="isMinimalRoute" class="h-full w-full bg-background text-foreground">
    <AILoadingIsland />
    <Toaster position="top-right" richColors :theme="activeToastTheme" />
    <ErrorPage 
      v-if="capturedError" 
      :code="capturedError.code"
      :title="capturedError.title"
      :message="capturedError.message"
      :details="capturedError.details"
      :fatal="capturedError.fatal"
      class="fixed inset-0 z-[100]"
    />
    <router-view v-else class="w-full h-full" />
  </div>

  <!-- Full Dynamic Double-Sidebar Layout -->
  <div v-else class="h-full w-full flex flex-row overflow-hidden bg-background text-foreground transition-all duration-300">
    <AILoadingIsland />
    <Toaster position="top-right" richColors :theme="activeToastTheme" />

    <!-- 1. PRIMARY SIDEBAR (Slim Navigation, Width: 16) -->
    <aside class="w-16 flex flex-col justify-between items-center py-4 bg-card border-r border-border flex-shrink-0 z-30 shadow-sm">
      <div class="flex flex-col items-center gap-6 w-full">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center justify-center p-2 rounded-xl bg-primary/10 border border-primary/20 hover:scale-105 transition-transform duration-200">
          <img src="/logo_new_purple.svg" alt="Pegasus Logo" class="h-7 w-7" />
        </RouterLink>

        <!-- Navigation Cluster -->
        <nav class="flex flex-col items-center gap-2 w-full px-2">
          <RouterLink 
            to="/dashboard" 
            class="flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-200"
            active-class="bg-primary/10 text-primary border border-primary/25 font-bold"
            title="Dashboards"
          >
            <LayoutDashboard class="w-5 h-5" />
          </RouterLink>

          <RouterLink 
            to="/query" 
            class="flex items-center justify-center w-11 h-11 rounded-xl text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all duration-200"
            active-class="bg-primary/10 text-primary border border-primary/25 font-bold"
            title="Spaces & Chat"
          >
            <MessageSquare class="w-5 h-5" />
          </RouterLink>
        </nav>
      </div>

      <!-- Bottom controls -->
      <div class="flex flex-col items-center gap-3 w-full px-2">
        <!-- Theme Toggle -->
        <button 
          @click="toggleTheme" 
          class="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Toggle Theme"
        >
          <Sun v-if="themeMode === 'light'" class="w-4 h-4" />
          <Moon v-else-if="themeMode === 'dark'" class="w-4 h-4" />
          <Monitor v-else class="w-4 h-4" />
        </button>

        <!-- Help -->
        <RouterLink 
          to="/support" 
          class="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Help & Support"
        >
          <CircleHelp class="w-4.5 h-4.5" />
        </RouterLink>

        <!-- Settings -->
        <RouterLink 
          to="/settings" 
          class="flex items-center justify-center w-10 h-10 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Settings"
        >
          <Settings class="w-4.5 h-4.5" />
        </RouterLink>

        <!-- User Profile Avatar / Login -->
        <div class="border-t border-border pt-3 w-full flex justify-center">
          <RouterLink v-if="user" to="/profile" class="relative group" title="My Profile">
            <img 
              :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`" 
              alt="Avatar" 
              class="w-8 h-8 rounded-xl object-cover border border-border group-hover:border-primary transition-colors"
            />
          </RouterLink>
          <button v-else @click="router.push('/signin')" class="flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors" title="Sign In">
            <User class="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- 2. SECONDARY SIDEBAR (Context-Aware Workspace, Width: 64) -->
    <aside 
      v-if="activeView !== 'none'"
      class="w-64 flex flex-col bg-card/65 backdrop-blur-md border-r border-border flex-shrink-0 z-20 transition-all duration-300"
    >
      <!-- STATE A: DASHBOARD VIEWS -->
      <div v-if="activeView === 'dashboard'" class="flex flex-col h-full">
        <!-- Brand Title & Net Worth aggregate -->
        <div class="p-4 border-b border-border bg-card/50">
          <span class="text-[9px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded tracking-widest uppercase border border-primary/20 inline-block mb-2">Pegasus Intelligence</span>
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block leading-none mb-1">Total Net Worth</span>
          <span class="text-xl font-extrabold text-foreground tracking-tight">$16,531.54</span>
        </div>

        <!-- Accounts Hierarchy list (Quicken Style) -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <div class="flex items-center justify-between text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2 px-1">
              <span>Financial Portfolios</span>
            </div>

            <!-- Banking sub-tree -->
            <div class="space-y-0.5">
              <button 
                @click="bankingOpen = !bankingOpen" 
                class="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/70 transition text-left"
              >
                <span class="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ChevronDown v-if="bankingOpen" class="w-3.5 h-3.5 text-muted-foreground" />
                  <ChevronRight v-else class="w-3.5 h-3.5 text-muted-foreground" />
                  <Wallet class="w-3.5 h-3.5 text-purple-500" />
                  Banking
                </span>
                <span class="text-xs font-bold text-foreground">$9,681.49</span>
              </button>
              
              <div v-show="bankingOpen" class="pl-7 pr-1 space-y-0.5 border-l border-border/60 ml-3.5 mt-0.5 mb-1.5">
                <div class="flex justify-between text-[11px] text-muted-foreground py-1 px-1.5 rounded hover:bg-muted/40 transition">
                  <span>WISE Cash Checking</span>
                  <span class="font-semibold text-foreground">$9,681.49</span>
                </div>
                <div class="flex justify-between text-[11px] text-muted-foreground py-1 px-1.5 rounded hover:bg-muted/40 transition">
                  <span>Savings Target Goals</span>
                  <span class="font-semibold text-emerald-600">+$958.00</span>
                </div>
              </div>
            </div>

            <!-- Investments sub-tree -->
            <div class="space-y-0.5 mt-2">
              <button 
                @click="investmentsOpen = !investmentsOpen" 
                class="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/70 transition text-left"
              >
                <span class="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ChevronDown v-if="investmentsOpen" class="w-3.5 h-3.5 text-muted-foreground" />
                  <ChevronRight v-else class="w-3.5 h-3.5 text-muted-foreground" />
                  <TrendingUp class="w-3.5 h-3.5 text-indigo-500" />
                  Investments
                </span>
                <span class="text-xs font-bold text-foreground">$5,850.05</span>
              </button>
              
              <div v-show="investmentsOpen" class="pl-7 pr-1 space-y-0.5 border-l border-border/60 ml-3.5 mt-0.5 mb-1.5">
                <div class="flex justify-between text-[11px] text-muted-foreground py-1 px-1.5 rounded hover:bg-muted/40 transition">
                  <span>Retirement Roth IRA</span>
                  <span class="font-semibold text-foreground">$5,850.05</span>
                </div>
              </div>
            </div>

            <!-- Assets sub-tree -->
            <div class="space-y-0.5 mt-2">
              <button 
                @click="assetsOpen = !assetsOpen" 
                class="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/70 transition text-left"
              >
                <span class="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ChevronDown v-if="assetsOpen" class="w-3.5 h-3.5 text-muted-foreground" />
                  <ChevronRight v-else class="w-3.5 h-3.5 text-muted-foreground" />
                  <Coins class="w-3.5 h-3.5 text-amber-500" />
                  Active Assets
                </span>
                <span class="text-xs font-bold text-foreground">$1,000.00</span>
              </button>
              
              <div v-show="assetsOpen" class="pl-7 pr-1 space-y-0.5 border-l border-border/60 ml-3.5 mt-0.5 mb-1.5">
                <div class="flex justify-between text-[11px] text-muted-foreground py-1 px-1.5 rounded hover:bg-muted/40 transition">
                  <span>Real Estate REITs</span>
                  <span class="font-semibold text-foreground">$1,000.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- STATE B: CHAT VIEWS -->
      <div v-if="activeView === 'chat'" class="flex flex-col h-full">
        <!-- New Chat Trigger -->
        <div class="p-4 border-b border-border">
          <button 
            @click="handleNewChat"
            class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/10 hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus class="w-4 h-4" />
            New Chat
          </button>
        </div>

        <!-- Conversations History (Gemini Style) -->
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
          <!-- Search box -->
          <div class="relative">
            <Search class="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search history..." 
              class="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-muted/20 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-muted-foreground transition-all"
            />
          </div>

          <!-- History items -->
          <div>
            <span class="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2 px-1">Recent Sessions</span>
            <div class="space-y-0.5">
              <button class="w-full text-left p-2 rounded-lg bg-primary/10 text-xs font-bold text-primary truncate border border-primary/20">
                📊 Monthly Spending Analysis
              </button>
              <button class="w-full text-left p-2 rounded-lg hover:bg-muted/65 text-xs font-medium text-muted-foreground hover:text-foreground truncate transition duration-150">
                💸 Rent vs Utility correlation
              </button>
              <button class="w-full text-left p-2 rounded-lg hover:bg-muted/65 text-xs font-medium text-muted-foreground hover:text-foreground truncate transition duration-150">
                📈 Stock performance pivot
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- STATE C: SETTINGS VIEWS -->
      <div v-if="activeView === 'settings'" class="flex flex-col h-full p-3 space-y-1">
        <span class="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-3 px-1">Preferences</span>

        <RouterLink 
          to="/settings" 
          class="flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          active-class="bg-muted text-foreground font-bold border border-border"
        >
          <Settings class="w-4 h-4" />
          General Preferences
        </RouterLink>

        <RouterLink 
          to="/profile" 
          class="flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          active-class="bg-muted text-foreground font-bold border border-border"
        >
          <User class="w-4 h-4" />
          User Profile
        </RouterLink>
      </div>
    </aside>

    <!-- 3. MAIN CANVAS VIEWPORT (Center-Right, Flex-1) -->
    <div class="flex-1 flex flex-col overflow-hidden relative">
      <!-- Content viewport canvas -->
      <main class="flex-1 overflow-y-auto w-full relative bg-background">
        <ErrorPage 
            v-if="capturedError" 
            :code="capturedError.code"
            :title="capturedError.title"
            :message="capturedError.message"
            :details="capturedError.details"
            :fatal="capturedError.fatal"
        />
        <router-view v-else class="w-full h-full" />
      </main>
    </div>
  </div>

  <PiscesDialog />
</template>

<style>
html,
body,
#app {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
