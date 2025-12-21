<template>
  <div class="w-full min-h-full bg-background">
    <div class="max-w-6xl mx-auto p-6 sm:p-10 space-y-12">
      
      <!-- Header -->
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-bold text-foreground">Support & Feedback</h1>
        <p class="text-muted-foreground text-lg">
          Check out what's new and let us know how we can improve
        </p>
      </div>

      <!-- Changelog Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles class="w-6 h-6 text-primary" />
          Release Notes
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

      <!-- Experimental Features Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Beaker class="w-6 h-6 text-amber-500" />
          Experimental Features
        </h2>

        <div class="p-8 rounded-xl border border-border bg-card space-y-6">
          <!-- Current Status -->
          <div v-if="experimentalStatus" class="p-4 rounded-lg" :class="experimentalStatus.hasAccess ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/50 border border-border'">
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

      <!-- Feedback Form Section -->
      <section class="space-y-6">
        <h2 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare class="w-6 h-6 text-primary" />
          Send Feedback
        </h2>

        <div class="p-8 rounded-xl border border-border bg-card">
          <form @submit.prevent="handleSubmit" class="space-y-6">
            
            <!-- Feature Category -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Feature Category *</label>
              <Select v-model="form.featureCategory">
                <SelectTrigger>
                  <SelectValue placeholder="Select a feature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dashboard">Dashboard</SelectItem>
                  <SelectItem value="Query">Query</SelectItem>
                  <SelectItem value="AI">AI</SelectItem>
                  <SelectItem value="Database Connections">Database Connections</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Custom Feature (shown when Other is selected) -->
            <div v-if="form.featureCategory === 'Other'" class="space-y-2">
              <label class="text-sm font-medium text-foreground">Specify Feature</label>
              <input
                v-model="form.customFeature"
                placeholder="Enter feature name"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <!-- Issue Type -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Issue Type *</label>
              <Select v-model="form.issueType">
                <SelectTrigger>
                  <SelectValue placeholder="Select issue type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bug">Bug</SelectItem>
                  <SelectItem value="Feature Request">Feature Request</SelectItem>
                  <SelectItem value="Improvement">Improvement</SelectItem>
                  <SelectItem value="Question">Question</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Description -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Description *</label>
              <textarea
                v-model="form.description"
                placeholder="Please describe your feedback in detail..."
                rows="6"
                class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              ></textarea>
              <p class="text-xs text-muted-foreground">{{ form.description.length }} / 1000 characters</p>
            </div>

            <!-- Email (optional) -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-foreground">Email (optional)</label>
              <input
                v-model="form.userEmail"
                type="email"
                placeholder="your@email.com"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p class="text-xs text-muted-foreground">We'll use this to follow up if needed</p>
            </div>

            <!-- Mark as Urgent -->
            <div class="flex items-center gap-2">
              <input
                id="urgent"
                v-model="form.isUrgent"
                type="checkbox"
                class="w-4 h-4 rounded border-input text-primary focus:ring-primary"
              />
              <label for="urgent" class="text-sm font-medium text-foreground cursor-pointer">
                Mark as urgent (critical issues only)
              </label>
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end gap-3 pt-4">
              <button
                type="button"
                @click="resetForm"
                class="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition"
              >
                Clear
              </button>
              <button
                type="submit"
                :disabled="!isFormValid || isSubmitting"
                class="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send class="w-4 h-4" />
                {{ isSubmitting ? 'Sending...' : 'Send Feedback' }}
              </button>
            </div>
          </form>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { submitFeedback } from '@/lib/api'
import { toast } from 'vue-sonner'
import { Sparkles, MessageSquare, Check, Send, Beaker, Clock, Plus, Wrench, Bug } from 'lucide-vue-next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

defineOptions({ name: 'SupportView' })

const releases = ref<any[]>([])
const releaseDetails = ref<Record<string, any>>({})
const expandedItems = ref(new Set<number>())

// Experimental Features State
const experimentalStatus = ref<{
  hasAccess: boolean
  requested: boolean
  requestedAt?: string
} | null>(null)

const experimentalForm = ref({
  reason: '',
  email: '',
  agreedToTerms: false
})

const isSubmittingExperimental = ref(false)

const isExperimentalFormValid = computed(() => {
  return experimentalForm.value.reason.trim().length > 20 &&
         experimentalForm.value.agreedToTerms
})

// Load experimental status
const loadExperimentalStatus = async () => {
  try {
    const response = await fetch('/api/experimental/status', {
      credentials: 'include'
    })
    if (response.ok) {
      experimentalStatus.value = await response.json()
    }
  } catch (error) {
    console.error('Failed to load experimental status:', error)
    // Default to no access if API fails
    experimentalStatus.value = { hasAccess: false, requested: false }
  }
}

// Handle experimental access request
const handleExperimentalRequest = async () => {
  if (!isExperimentalFormValid.value) return

  isSubmittingExperimental.value = true
  try {
    const response = await fetch('/api/experimental/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        reason: experimentalForm.value.reason,
        email: experimentalForm.value.email || undefined
      })
    })

    if (!response.ok) throw new Error('Failed to submit request')

    toast.success('Request submitted!', {
      description: 'We\'ll review your request and notify you once approved.'
    })

    // Reload status
    await loadExperimentalStatus()

    // Reset form
    experimentalForm.value = {
      reason: '',
      email: '',
      agreedToTerms: false
    }
  } catch (error) {
    console.error('Failed to submit experimental request:', error)
    toast.error('Failed to submit request', {
      description: 'Please try again later.'
    })
  } finally {
    isSubmittingExperimental.value = false
  }
}

// Load releases and changelog details
onMounted(async () => {
  await loadExperimentalStatus()
  
  try {
    // Load releases index
    const releasesResponse = await fetch('/releases.json')
    releases.value = (await releasesResponse.json()).releases
    
    // Load details for each release
    for (const release of releases.value) {
      try {
        const detailResponse = await fetch(`/changelogs/${release.changelogFile}`)
        releaseDetails.value[release.version] = await detailResponse.json()
      } catch (error) {
        console.error(`Failed to load changelog for ${release.version}:`, error)
      }
    }
  } catch (error) {
    console.error('Failed to load releases:', error)
    releases.value = []
  }
})

const toggleExpanded = (index: number) => {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
  // Trigger reactivity
  expandedItems.value = new Set(expandedItems.value)
}

// Helper functions for category styling
const getCategoryIcon = (category: string) => {
  const icons: Record<string, any> = {
    'New Features': Plus,
    'Improvements': Wrench,
    'Bug Fixes': Bug
  }
  return icons[category] || Plus
}

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    'New Features': 'text-primary',
    'Improvements': 'text-blue-500',
    'Bug Fixes': 'text-green-500'
  }
  return colors[category] || 'text-primary'
}

const form = ref({
  featureCategory: '',
  customFeature: '',
  issueType: '',
  description: '',
  userEmail: '',
  isUrgent: false
})

const isSubmitting = ref(false)

const isFormValid = computed(() => {
  return form.value.featureCategory && 
         form.value.issueType && 
         form.value.description.trim().length > 0 &&
         form.value.description.length <= 1000
})

const resetForm = () => {
  form.value = {
    featureCategory: '',
    customFeature: '',
    issueType: '',
    description: '',
    userEmail: '',
    isUrgent: false
  }
}

const handleSubmit = async () => {
  if (!isFormValid.value) return

  isSubmitting.value = true
  try {
    const browserInfo = navigator.userAgent
    
    await submitFeedback({
      ...form.value,
      browserInfo
    })

    toast.success('Feedback submitted successfully!', {
      description: form.value.isUrgent 
        ? 'We\'ll review this urgent feedback immediately.' 
        : 'Thank you for helping us improve Pegasus.'
    })

    resetForm()
  } catch (error) {
    console.error('Failed to submit feedback:', error)
    toast.error('Failed to submit feedback', {
      description: 'Please try again later or contact support directly.'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>
