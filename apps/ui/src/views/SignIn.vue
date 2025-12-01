<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-950 text-stone-100">
    <div class="bg-stone-900 p-8 rounded-lg shadow-lg w-full max-w-md">
      <h2 class="text-2xl font-bold mb-6 text-violet-400">Sign In</h2>
      <button
        class="w-full py-3 px-4 rounded-md bg-violet-600 hover:bg-violet-500 text-white font-semibold text-lg transition"
        @click="signInWithWorkOS"
      >
        Sign in with SSO
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// This is a placeholder for WorkOS SSO redirect
const signInWithWorkOS = () => {
  // Replace with your WorkOS SSO URL
  window.location.href = 'https://auth.workos.com/sso/start?connection=YOUR_CONNECTION_ID&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_CALLBACK_URL';
}
</script>
