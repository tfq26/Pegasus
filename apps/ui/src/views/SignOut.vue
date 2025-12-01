<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-950 text-stone-100">
    <div class="bg-stone-900 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
      <h2 class="text-2xl font-bold mb-6 text-violet-400">Sign Out</h2>
      <p class="mb-6 text-stone-300">You are about to sign out of Pegasus.</p>
      <button
        class="w-full py-3 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition"
        @click="signOut"
      >
        Sign Out
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// This is a placeholder for sign out logic
const signOut = () => {
  // Clear session, tokens, etc.
  localStorage.removeItem('workos_token')
  window.location.href = '/signin'
}
</script>
