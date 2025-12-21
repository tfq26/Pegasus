<template>
  <div class="w-full min-h-full bg-background">
    <div class="max-w-6xl mx-auto p-6 sm:p-10 space-y-12">
      
      <!-- Header -->
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold text-foreground">Release Notes</h1>
        <p class="text-muted-foreground text-lg">
          Stay up to date with the latest features and improvements
        </p>
      </div>

      <!-- Changelog Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles class="w-6 h-6 text-primary" />
          Latest Releases
        </h2>
        
        <div class="space-y-4">
          <div v-for="(release, index) in releases" :key="release.version" class="rounded-xl border border-border bg-card overflow-hidden">
            <button
              @click="toggleExpanded(index)"
              class="w-full p-6 text-left hover:bg-accent/50 transition-colors"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="px-3 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                      v{{ release.version }}
                    </span>
                    <span v-if="release.isLatest" class="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                      Latest
                    </span>
                    <span class="text-sm text-muted-foreground">{{ release.releaseDate }}</span>
                  </div>
                  <h3 class="text-lg font-semibold text-foreground mb-2">{{ release.title }}</h3>
                  <p class="text-muted-foreground">{{ release.description }}</p>
                </div>
                <div class="shrink-0 transition-transform duration-200" :class="{ 'rotate-180': expandedItems.has(index) }">
                  <svg class="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>
            
            <div 
              v-if="expandedItems.has(index) && releaseDetails[release.version]"
              class="px-6 pb-6 border-t border-border bg-muted/20 space-y-6"
            >
              <!-- Highlights -->
              <div v-if="releaseDetails[release.version].highlights" class="mt-6">
                <h4 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles class="w-4 h-4 text-amber-500" />
                  Highlights
                </h4>
                <ul class="space-y-2">
                  <li v-for="(highlight, i) in releaseDetails[release.version].highlights" :key="i" class="text-sm text-muted-foreground flex items-start gap-2">
                    <Check class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <span>{{ highlight }}</span>
                  </li>
                </ul>
              </div>

              <!-- Sections (New Features, Improvements, Bug Fixes) -->
              <div v-for="section in releaseDetails[release.version].sections" :key="section.category" class="space-y-4">
                <h4 class="text-sm font-semibold text-foreground flex items-center gap-2">
                  <component :is="getCategoryIcon(section.category)" class="w-4 h-4" :class="getCategoryColor(section.category)" />
                  {{ section.category }}
                </h4>
                
                <div v-for="item in section.items" :key="item.title" class="pl-6 space-y-2">
                  <div>
                    <h5 class="text-sm font-medium text-foreground">{{ item.title }}</h5>
                    <p class="text-xs text-muted-foreground mt-1">{{ item.description }}</p>
                  </div>
                  <ul class="space-y-1.5">
                    <li v-for="(detail, i) in item.details" :key="i" class="text-xs text-muted-foreground flex items-start gap-2">
                      <span class="text-primary mt-1">•</span>
                      <span>{{ detail }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Experimental Features Section (Only for authorized users) -->
      <section v-if="experimentalStatus" class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Beaker class="w-6 h-6 text-amber-500" />
          Experimental Features
        </h2>

        <div class="p-8 rounded-xl border border-border bg-card space-y-6">
          <!-- Current Status -->
          <div class="p-4 rounded-lg" :class="experimentalStatus.hasAccess ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/50 border border-border'">
            <div class="flex items-start gap-3">
              <component :is="experimentalStatus.hasAccess ? Check : Clock" class="w-5 h-5 mt-0.5" :class="experimentalStatus.hasAccess ? 'text-green-500' : 'text-muted-foreground'" />
              <div class="flex-1">
                <h3 class="font-semibold text-foreground mb-1">
                  {{ experimentalStatus.hasAccess ? 'Experimental Access Enabled' : experimentalStatus.requested ? 'Access Request Pending' : 'No Experimental Access' }}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {{ experimentalStatus.hasAccess 
                      ? 'You have access to experimental features. Enable them in Settings → Experimental.' 
                      : experimentalStatus.requested
                      ? 'Your request is being reviewed. We\'ll notify you once approved.'
                      : 'Request access to try cutting-edge features before they\'re released.' }}
                </p>
                <p v-if="experimentalStatus.requestedAt" class="text-xs text-muted-foreground mt-2">
                  Requested: {{ new Date(experimentalStatus.requestedAt).toLocaleDateString() }}
                </p>
              </div>
            </div>
          </div>

          <!-- Request Form -->
          <div v-if="!experimentalStatus?.hasAccess && !experimentalStatus?.requested" class="space-y-4">
            <div>
              <h3 class="font-semibold text-foreground mb-2">Request Experimental Access</h3>
              <p class="text-sm text-muted-foreground mb-4">
                Get early access to experimental features like manual Excel formulas, advanced AI modes, and more. 
                Tell us why you'd like to participate in our experimental program.
              </p>
            </div>

            <form @submit.prevent="handleExperimentalRequest" class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-foreground">Why do you want experimental access? *</label>
                <textarea
                  v-model="experimentalForm.reason"
                  placeholder="Tell us about your use case and how experimental features would help..."
                  rows="4"
                  class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  maxlength="500"
                ></textarea>
                <p class="text-xs text-muted-foreground">{{ experimentalForm.reason.length }} / 500 characters</p>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-foreground">Email for updates (optional)</label>
                <input
                  v-model="experimentalForm.email"
                  type="email"
                  placeholder="your@email.com"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div class="flex items-start gap-2">
                <input
                  id="experimental-agree"
                  v-model="experimentalForm.agreedToTerms"
                  type="checkbox"
                  class="w-4 h-4 rounded border-input text-primary focus:ring-primary mt-0.5"
                />
                <label for="experimental-agree" class="text-sm text-muted-foreground cursor-pointer">
                  I understand that experimental features may be unstable, change without notice, or be removed entirely.
                </label>
              </div>

              <button
                type="submit"
                :disabled="!isExperimentalFormValid || isSubmittingExperimental"
                class="px-6 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Beaker class="w-4 h-4" />
                {{ isSubmittingExperimental ? 'Submitting...' : 'Request Access' }}
              </button>
            </form>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Sparkles, Check, Plus, Wrench, Bug, Beaker, Clock } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useAuth } from '@/composables/useAuth'

defineOptions({ name: 'ReleasesPage' })

const { user } = useAuth()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const releases = ref<any[]>([])
const releaseDetails = ref<Record<string, any>>({})
const expandedItems = ref(new Set<number>())
const experimentalStatus = ref<any>(null)
const experimentalForm = ref({
  reason: '',
  email: '',
  agreedToTerms: false
})
const isSubmittingExperimental = ref(false)

const isExperimentalFormValid = computed(() => {
  return experimentalForm.value.reason.trim().length >= 20 && experimentalForm.value.agreedToTerms
})

const toggleExpanded = (index: number) => {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'New Features': return Plus
    case 'Improvements': return Wrench
    case 'Bug Fixes': return Bug
    default: return Check
  }
}

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'New Features': return 'text-green-500'
    case 'Improvements': return 'text-blue-500'
    case 'Bug Fixes': return 'text-orange-500'
    default: return 'text-muted-foreground'
  }
}

const handleExperimentalRequest = async () => {
  if (!isExperimentalFormValid.value) return

  isSubmittingExperimental.value = true
  try {
    const response = await fetch(`${API_URL}/experimental/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        reason: experimentalForm.value.reason,
        email: experimentalForm.value.email || undefined
      })
    })

    if (response.ok) {
      toast.success('Request submitted successfully!')
      experimentalForm.value = { reason: '', email: '', agreedToTerms: false }
      await fetchExperimentalStatus()
    } else {
      const error = await response.json()
      toast.error(error.error || 'Failed to submit request')
    }
  } catch (error) {
    console.error('Error submitting experimental request:', error)
    toast.error('Failed to submit request')
  } finally {
    isSubmittingExperimental.value = false
  }
}

const fetchExperimentalStatus = async () => {
  if (!user.value) return
  
  try {
    const response = await fetch(`${API_URL}/experimental/status`, {
      credentials: 'include'
    })
    if (response.ok) {
      experimentalStatus.value = await response.json()
    }
  } catch (error) {
    console.error('Error fetching experimental status:', error)
  }
}

onMounted(async () => {
  try {
    // Fetch releases index
    const releasesResponse = await fetch('/releases.json')
    const releasesData = await releasesResponse.json()
    releases.value = releasesData.releases || []

    // Fetch details for each release
    for (const release of releases.value) {
      const detailResponse = await fetch(`/changelogs/${release.changelogFile}`)
      const details = await detailResponse.json()
      releaseDetails.value[release.version] = details
    }

    // Fetch experimental status if user is logged in
    await fetchExperimentalStatus()
  } catch (error) {
    console.error('Error loading releases:', error)
    toast.error('Failed to load release notes')
  }
})
</script>
