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

      <!-- Documentation & Releases Redirect -->
      <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RouterLink to="/docs" class="group p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-violet-500/50 hover:bg-violet-500/5 transition-all duration-300 shadow-lg hover:shadow-violet-500/10">
          <div class="flex items-start justify-between mb-4">
            <div class="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 group-hover:scale-110 transition-transform">
              <BookOpen class="w-6 h-6 text-violet-500" />
            </div>
            <ArrowRight class="w-5 h-5 text-muted-foreground group-hover:text-violet-500 transition-colors" />
          </div>
          <h3 class="text-xl font-bold text-foreground mb-2">Documentation</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Need help setting up cloud credentials or exploring features? Check out our step-by-step guides.
          </p>
        </RouterLink>

        <RouterLink to="/releases" class="group p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-amber-500/50 hover:bg-amber-500/5 transition-all duration-300 shadow-lg hover:shadow-amber-500/10">
          <div class="flex items-start justify-between mb-4">
            <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <Sparkles class="w-6 h-6 text-amber-500" />
            </div>
            <ArrowRight class="w-5 h-5 text-muted-foreground group-hover:text-amber-500 transition-colors" />
          </div>
          <h3 class="text-xl font-bold text-foreground mb-2">What's New</h3>
          <p class="text-sm text-muted-foreground leading-relaxed">
            Stay up to date with the latest features, improvements, and bug fixes in Pegasus.
          </p>
        </RouterLink>
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
              <select
                v-model="form.featureCategory"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a feature</option>
                <option value="Dashboard">Dashboard</option>
                <option value="Query">Query</option>
                <option value="AI">AI</option>
                <option value="Database Connections">Database Connections</option>
                <option value="Other">Other</option>
              </select>
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
              <select
                v-model="form.issueType"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select issue type</option>
                <option value="Bug">Bug</option>
                <option value="Feature Request">Feature Request</option>
                <option value="Improvement">Improvement</option>
                <option value="Question">Question</option>
              </select>
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
import { useNotifications, toast } from '@/composables/useNotifications'
import { Sparkles, MessageSquare, Check, Send, Beaker, Clock, BookOpen, ArrowRight } from 'lucide-vue-next'
import { api } from '@/lib/apiClient'

defineOptions({ name: 'SupportView' })

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

const loadExperimentalStatus = async () => {
  try {
    const status = await api.get<any>('/api/experimental/status', { skipAuthRedirect: true })
    if (status) {
      experimentalStatus.value = status
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
    const result = await api.post<any>('/api/experimental/request', {
        reason: experimentalForm.value.reason,
        email: experimentalForm.value.email || undefined
    })

    if (result) {
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
    }
  } catch (error: any) {
    console.error('Failed to submit experimental request:', error)
    toast.error('Failed to submit request', {
      description: error.message || 'Please try again later.'
    })
  } finally {
    isSubmittingExperimental.value = false
  }
}

onMounted(async () => {
  await loadExperimentalStatus()
})

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
