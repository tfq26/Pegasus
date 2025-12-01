<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-stone-950 text-stone-100 p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="text-center">
      <div class="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent mb-4"></div>
      <p class="text-stone-400">Loading profile...</p>
    </div>

    <!-- Not Logged In -->
    <div v-else-if="!user" class="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-lg shadow-black/30 text-center">
      <div class="mb-6">
        <svg class="inline-block h-16 w-16 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-stone-300 mb-2">Not Logged In</h2>
      <p class="text-stone-400 mb-6">Please log in to view your profile</p>
      <button
        @click="goToLogin"
        class="w-full px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium transition-all hover:scale-105 shadow-lg shadow-violet-600/20"
      >
        Go to Login
      </button>
    </div>

    <!-- Profile Content -->
    <div v-else class="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-lg shadow-black/30">
      <div class="flex flex-col items-center mb-6">
        <img
          :src="user.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user.email}`"
          class="h-24 w-24 rounded-full border border-violet-500 mb-3 object-cover"
          alt="User Avatar"
        />
        <h2 class="text-xl font-semibold text-violet-400">{{ user.firstName }} {{ user.lastName }}</h2>
        <p class="text-sm text-stone-400">{{ user.email }}</p>
      </div>

      <div class="space-y-3 text-sm text-stone-300 mb-6">
        <p><span class="font-medium text-stone-400">User ID:</span> {{ user.sub }}</p>
        <p><span class="font-medium text-stone-400">Status:</span> Active</p>
      </div>

      <div class="flex gap-3">
        <button
          @click="goToDashboard"
          class="flex-1 px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-sm font-medium transition"
        >
          Dashboard
        </button>
        <button
          @click="logout"
          class="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

defineOptions({ name: 'ProfilePage' })

const router = useRouter()
const { user, isLoading, fetchUser, logout } = useAuth()

onMounted(() => {
  fetchUser()
})

const goToLogin = () => {
  router.push('/login')
}

const goToDashboard = () => {
  router.push('/')
}
</script>
