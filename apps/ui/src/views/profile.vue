<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-stone-950 text-stone-100 p-6">
    <div class="max-w-md w-full bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-lg shadow-black/30">
      <div class="flex flex-col items-center mb-6">
        <img
          src="https://api.dicebear.com/8.x/avataaars/svg?seed=PegasusUser"
          class="h-24 w-24 rounded-full border border-violet-500 mb-3"
          alt="User Avatar"
        />
        <h2 class="text-xl font-semibold text-violet-400">Pegasus User</h2>
        <p class="text-sm text-stone-400">user@pegasus.ai</p>
      </div>

      <div class="space-y-3 text-sm text-stone-300">
        <p><span class="font-medium text-stone-400">Role:</span> Developer</p>
        <p><span class="font-medium text-stone-400">Joined:</span> July 2025</p>
        <p><span class="font-medium text-stone-400">Status:</span> Active</p>
      </div>

      <button
        class="mt-6 w-full px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition"
      >
        Edit Profile
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ProfilePage' })
</script>
