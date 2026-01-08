<template>
  <div class="min-h-screen bg-background text-foreground p-4 md:p-8 xl:p-12 transition-all duration-500">
    <!-- Loading State -->
    <div v-if="isPageLoading" class="flex flex-col items-center justify-center min-h-[80vh]">
      <div class="relative">
        <div class="h-24 w-24 rounded-full border-t-4 border-b-4 border-primary animate-spin"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
           <div class="h-16 w-16 rounded-full border-t-4 border-b-4 border-primary/30 animate-spin-slow"></div>
        </div>
      </div>
      <p class="mt-8 text-xl font-bold tracking-tight text-foreground animate-pulse">Initializing Pegasus Vault...</p>
      <p class="text-muted-foreground text-sm mt-2">Securing your session and fetching encrypted data</p>
    </div>

    <!-- Payment Verification Overlay -->
    <div v-if="isVerifyingPayment" class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div class="bg-card border border-border rounded-xl p-8 shadow-2xl max-w-sm w-full text-center">
            <div class="relative mx-auto mb-6 h-20 w-20">
                <div class="absolute inset-0 rounded-full border-4 border-primary/30 animate-ping"></div>
                <div class="absolute inset-0 rounded-full border-4 border-t-primary animate-spin"></div>
                <div class="absolute inset-0 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
            </div>
            <h3 class="text-xl font-bold mb-2">Verifying Purchase</h3>
            <p class="text-muted-foreground text-sm mb-6">Please wait while we confirm your transaction with the payment provider...</p>
            <div class="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div class="h-full bg-primary animate-progress-indeterminate"></div>
            </div>
        </div>
    </div>

    <!-- Not Logged In -->
    <div v-else-if="!typedUser" class="max-w-md mx-auto mt-20 w-full bg-card border border-border rounded-xl p-8 shadow-lg text-center">
      <div class="mb-6">
        <svg class="inline-block h-16 w-16 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-foreground mb-2">Not Logged In</h2>
      <p class="text-muted-foreground mb-6">Please log in to view your profile</p>
      <button
        @click="goToLogin"
        class="w-full px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all hover:scale-105 shadow-lg shadow-primary/20"
      >
        Go to Login
      </button>
    </div>

    <!-- Profile Content -->
    <div v-else class="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      <!-- Header Section -->
      <div class="flex flex-col sm:flex-row items-center sm:items-end gap-6 pb-8 border-b border-border">
        <img
          :src="typedUser.profilePictureUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${typedUser.email}`"
          class="h-24 w-24 rounded-full border-4 border-background shadow-lg object-cover bg-card"
          alt="User Avatar"
        />
        <div class="text-center md:text-left flex-1">
          <h1 class="text-3xl font-bold tracking-tight text-foreground flex items-center flex-wrap gap-3">
            {{ typedUser.firstName }} {{ typedUser.lastName }}
            <span v-if="subscriptionTier === 'pro' || subscriptionTier === 'pro_plus'" 
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black text-white shadow-sm"
                  :class="subscriptionTier === 'pro_plus' ? 'bg-gradient-to-r from-blue-600 to-indigo-600' : 'bg-gradient-to-r from-purple-500 to-indigo-500'"
            >
              {{ subscriptionTier === 'pro_plus' ? 'PRO+' : 'PRO' }}
            </span>
            <button 
              v-if="subscriptionTier !== 'pro_plus'"
              @click="router.push('/pricing')"
              class="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-gradient-to-r from-purple-600 via-violet-600 to-orange-500 hover:from-purple-500 hover:to-orange-400 text-white shadow-lg shadow-purple-500/20 transition-all hover:scale-105 border border-white/10"
            >
              Upgrade to Pro+
            </button>
          </h1>
          <p class="text-muted-foreground">{{ typedUser.email }}</p>
          <div v-if="typedUser.organizationName" class="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
            {{ typedUser.organizationName }}
          </div>
        </div>
        <div class="flex gap-3">
          <button
            @click="logout"
            class="px-4 py-2 rounded-lg border border-red-500/50 hover:border-red-500 bg-background text-red-500/80 hover:text-red-500 text-sm font-medium transition shadow-md shadow-red-500/10 hover:shadow-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
        
        <!-- Column 1: Subscription & Identity -->
        <div class="space-y-6 order-2 lg:order-1">
          <!-- Subscription Card -->
          <div class="bg-card border border-border rounded-xl p-6 shadow-sm transition-all duration-300" 
               :class="{
                 'border-purple-500/50 shadow-purple-500/20 shadow-md': subscriptionTier === 'pro',
                 'border-blue-500/50 shadow-blue-500/20 shadow-md': subscriptionTier === 'pro_plus'
               }">
            <h3 class="font-semibold text-lg mb-4 text-foreground text-center">Subscription</h3>
            
            <!-- Free Plan View -->
            <div v-if="subscriptionTier === 'free'" class="mb-6">
               <div class="flex items-center justify-between">
                  <span class="text-muted-foreground text-sm">Current Plan</span>
                  <span class="bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-bold capitalize">Free</span>
               </div>
            </div>

            <!-- Pro Plan View -->
            <div v-else class="mb-6 space-y-3">

               <div class="flex justify-between items-center" v-if="subscriptionDetails">
                  <span class="text-xs text-muted-foreground">Renews On</span>
                  <span class="text-sm font-medium">{{ new Date(subscriptionDetails.renewalDate).toLocaleDateString() }}</span>
               </div>
               <div class="flex justify-between items-center" v-if="subscriptionDetails">
                  <span class="text-xs text-muted-foreground">Amount</span>
                  <span class="text-sm font-medium">${{ (subscriptionDetails.amount / 100).toFixed(2) }} / {{ subscriptionDetails.interval }}</span>
               </div>
               <div v-else class="flex justify-between items-center text-sm">
                   <span class="text-muted-foreground">Status</span>
                   <span class="font-medium text-purple-500">Active</span>
               </div>
            </div>
            
            <button 
              v-if="subscriptionTier === 'free'"
              @click="handleUpgrade"
              class="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium transition-all shadow-md shadow-violet-500/20"
            >
              Upgrade to Pro
            </button>
            <button 
              v-else
              @click="handleManageSubscription"
              class="w-full py-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm hover:shadow-md border border-primary/40 hover:border-primary/60"
            >
              Manage Subscription
            </button>
            <p v-if="subscriptionTier === 'free'" class="text-xs text-muted-foreground mt-3 text-center italic">
              Unlock higher limits and premium features.
            </p>
          </div>


          <!-- Usage Stats Group -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
            <!-- Tokens Circle -->
            <div class="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-sm flex flex-col items-center hover:border-primary/30 transition-colors">
                <div class="relative w-32 h-32 flex items-center justify-center mb-4">
                  <!-- Blurred background glow -->
                  <div class="absolute inset-2 bg-primary/5 blur-xl rounded-full"></div>
                  
                  <svg class="w-full h-full transform -rotate-90">
                    <circle 
                      cx="64" cy="64" r="58"
                      stroke="currentColor" stroke-width="8" fill="transparent"
                      class="text-secondary/50"
                    />
                    <circle 
                      cx="64" cy="64" r="58"
                      stroke="currentColor" stroke-width="10" fill="transparent"
                      stroke-linecap="round"
                      :stroke-dasharray="2 * Math.PI * 58"
                      :stroke-dashoffset="2 * Math.PI * 58 * (1 - Math.min(usageStats.tokens / usageStats.limit, 1))"
                      class="text-primary transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-xl font-bold">{{ Math.round((usageStats.tokens / usageStats.limit) * 100) }}%</span>
                    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Used</span>
                  </div>
                </div>
                <div class="text-center">
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">AI Tokens</p>
                  <h4 class="text-lg font-bold">{{ usageStats.tokens.toLocaleString() }}</h4>
                  <p class="text-[10px] text-muted-foreground font-medium mt-1">Limit: {{ (usageStats.limit / 1000).toFixed(0) }}k</p>
                </div>
            </div>

            <!-- Storage Circle -->
            <div class="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-6 shadow-sm flex flex-col items-center hover:border-blue-500/30 transition-colors">
                <div class="relative w-32 h-32 flex items-center justify-center mb-4">
                   <!-- Blurred background glow -->
                  <div class="absolute inset-2 bg-blue-500/5 blur-xl rounded-full"></div>
                  
                  <svg class="w-full h-full transform -rotate-90">
                    <circle 
                      cx="64" cy="64" r="58"
                      stroke="currentColor" stroke-width="8" fill="transparent"
                      class="text-secondary/50"
                    />
                    <circle 
                      cx="64" cy="64" r="58"
                      stroke="currentColor" stroke-width="10" fill="transparent"
                      stroke-linecap="round"
                      :stroke-dasharray="2 * Math.PI * 58"
                      :stroke-dashoffset="2 * Math.PI * 58 * (1 - Math.min(usageStats.storage / usageStats.storageLimit, 1))"
                      class="text-blue-500 transition-all duration-1000 ease-out shadow-lg"
                    />
                  </svg>
                  <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <span class="text-xl font-bold">{{ Math.round((usageStats.storage / usageStats.storageLimit) * 100) }}%</span>
                    <span class="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Storage</span>
                  </div>
                </div>
                <div class="text-center">
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Vault Storage</p>
                  <h4 class="text-lg font-bold">{{ usageStats.storageFormatted }}</h4>
                  <p class="text-[10px] text-muted-foreground font-medium mt-1">Limit: {{ usageStats.storageLimitFormatted }}</p>
                </div>
            </div>
          </div>
        </div>

        <!-- Column 2: Purchase & Upgrade Actions -->
        <div class="space-y-6 order-1 lg:order-2">
          
          <!-- Add Tokens Section (Pro Only) -->
          <div v-if="subscriptionTier === 'pro'" class="bg-card border border-border rounded-xl p-6 shadow-sm relative overflow-hidden">
            <div class="absolute top-0 right-0 p-3 opacity-10">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-32 w-32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
            </div>
            
            <div class="relative z-10">
              <div class="mb-6">
                <h3 class="font-semibold text-lg">Add More Tokens</h3>
                <p class="text-sm text-muted-foreground">Running low? Instantly add more capacity to your account.</p>
              </div>

              <div class="bg-secondary/30 p-5 rounded-xl border border-secondary backdrop-blur-sm">
                <div class="flex justify-between items-end mb-6">
                   <div>
                      <span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Quantity</span>
                      <div class="flex items-center gap-2">
                        <span class="text-2xl font-bold">{{ tokenPurchaseAmount * 100 }}k <span class="text-base font-normal text-muted-foreground">tokens</span></span>
                        <span v-if="tokenDiscount > 0" class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold uppercase tracking-tight">
                          -{{ tokenDiscount }}% Off
                        </span>
                      </div>
                   </div>
                   <div class="text-right">
                      <span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Price</span>
                      <span class="text-2xl font-bold text-primary">${{ calculatedTokenPrice }}</span>
                   </div>
                </div>
                
                <div class="px-2 mb-6">
                  <Slider 
                      v-model="tokenPurchaseList" 
                      :min="1" 
                      :max="7" 
                      :step="1" 
                      class="my-4"
                  />
                  <div class="flex justify-between text-xs text-muted-foreground mt-2 font-medium">
                      <span>100k</span>
                      <span>700k (Max)</span>
                  </div>
                </div>

                <div v-if="usageStats?.limit + (tokenPurchaseAmount * 100000) >= 1000000" class="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div class="flex items-start gap-3">
                        <div class="mt-0.5 p-1 bg-amber-500/20 rounded-lg">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        </div>
                        <div class="flex-1">
                            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-0.5">Surcharge Active</p>
                            <p class="text-[11px] text-amber-700/80 leading-snug font-medium">
                                <span v-if="usageStats?.limit >= 1000000">Heavy usage sustainability fee applied.</span>
                                <span v-else>Purchase crosses 1M limit; includes sustainability fee.</span>
                            </p>
                        </div>
                    </div>
                </div>
                
                <button 
                    @click="handleBuyTokens" 
                    :disabled="isBuyingTokens"
                    class="w-full py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <div v-if="isBuyingTokens" class="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                    {{ isBuyingTokens ? 'Processing...' : 'Purchase Tokens' }}
                </button>
              </div>
            </div>
          </div>


           <!-- Expand Vault Storage -->
           <div class="bg-card border border-border rounded-xl p-6 shadow-sm relative overflow-hidden">
             <div class="absolute top-0 right-0 p-3 opacity-10 text-blue-500">
               <svg xmlns="http://www.w3.org/2000/svg" class="h-32 w-32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><rect width="20" height="8" x="2" y="8" rx="2"/></svg>
             </div>
             
             <div class="relative z-10">
               <div class="mb-6">
                 <h3 class="font-semibold text-lg">Expand Vault Storage</h3>
                 <p class="text-sm text-muted-foreground">Add more permanent capacity for your datasets and analysis results.</p>
               </div>
 
               <div class="bg-blue-500/5 p-5 rounded-xl border border-blue-500/10 backdrop-blur-sm">
                 <div class="flex justify-between items-end mb-6">
                    <div>
                       <span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Add Capacity</span>
                       <span class="text-2xl font-bold">{{ storagePurchaseAmount }}GB <span class="text-base font-normal text-muted-foreground">extra</span></span>
                    </div>
                    <div class="text-right">
                       <span class="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Price</span>
                       <span class="text-2xl font-bold text-blue-600">${{ calculatedStoragePrice }}</span>
                    </div>
                 </div>
                 
                 <div class="px-2 mb-6">
                   <div class="relative group">
                     <input 
                       type="number" 
                       v-model="storagePurchaseAmount" 
                       min="1" 
                       max="50"
                       class="w-full bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all appearance-none"
                       placeholder="Enter GB amount"
                     />
                     <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                       <span class="text-sm font-bold text-blue-600/60 uppercase tracking-tighter">GB</span>
                       <div class="h-6 w-[1px] bg-blue-500/20"></div>
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                     </div>
                   </div>
                   <div class="flex justify-between items-center mt-3 px-1">
                      <div class="flex items-center gap-1.5">
                        <span class="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">$5.00 per GB Expansion</span>
                      </div>
                      <span class="text-[10px] text-muted-foreground font-medium">Max 50GB / Order</span>
                   </div>
                 </div>
 
                 <button 
                     @click="handleBuyStorage" 
                     :disabled="isBuyingStorage"
                     class="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                     <div v-if="isBuyingStorage" class="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                     {{ isBuyingStorage ? 'Processing...' : 'Expand Storage' }}
                 </button>
               </div>
             </div>
           </div>

          <!-- Feature Teaser (Free Only) -->
          <div v-if="subscriptionTier === 'free'" class="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-slate-900 dark:to-slate-800 border border-indigo-100 dark:border-slate-700 rounded-xl p-6 text-center shadow-sm">
             <h4 class="font-semibold text-indigo-900 dark:text-indigo-100 mb-2">Need more power?</h4>
             <p class="text-sm text-indigo-700 dark:text-indigo-300 mb-4">Upgrade to Pro or Pro+ to access up to 600k monthly tokens and 10GB storage.</p>
             <button @click="router.push('/pricing')" class="text-xs font-bold text-primary px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all border border-primary/20">
               Compare All Plans
             </button>
          </div>


        </div>

        <!-- Column 3: Transaction History -->
        <div class="space-y-6 order-3 lg:col-span-2 xl:col-span-1">
          <!-- Transaction History Section -->
          <div class="bg-card border border-border rounded-xl p-6 shadow-sm h-full flex flex-col min-h-[400px]">
            <div class="flex items-center justify-between mb-6">
               <h3 class="font-semibold text-lg">Transaction History</h3>
               <button @click="fetchPayments" class="text-xs text-primary hover:underline flex items-center gap-1">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                 Refresh
               </button>
            </div>

            <div v-if="isLoadingPayments" class="flex justify-center py-8">
               <div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-r-transparent"></div>
            </div>
            
            <div v-else-if="payments.length === 0" class="text-center py-12 border-2 border-dashed border-border rounded-2xl bg-secondary/5">
               <div class="mb-4 inline-flex p-3 rounded-full bg-secondary/10">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               </div>
               <p class="text-muted-foreground text-sm font-medium">No transactions linked to this vault yet.</p>
            </div>
            
            <div v-else class="overflow-x-auto -mx-6 px-6">
               <table class="w-full text-sm text-left border-separate border-spacing-y-2">
                  <thead class="text-muted-foreground">
                     <tr>
                        <th class="pb-2 px-4 font-bold uppercase tracking-widest text-[9px] opacity-70">Date</th>
                        <th class="pb-2 px-4 font-bold uppercase tracking-widest text-[9px] opacity-70">Description</th>
                        <th class="pb-2 px-4 font-bold uppercase tracking-widest text-[9px] opacity-70">Amount</th>
                        <th class="pb-2 px-4 text-right font-bold uppercase tracking-widest text-[9px] opacity-70">Status</th>
                     </tr>
                  </thead>
                  <tbody>
                     <tr v-for="payment in payments" :key="payment.id" class="group bg-secondary/5 hover:bg-secondary/10 transition-colors">
                        <td class="py-4 px-4 text-muted-foreground whitespace-nowrap first:rounded-l-xl">
                           {{ new Date(payment.created_at).toLocaleDateString() }}
                        </td>
                        <td class="py-4 px-4 font-semibold">
                           {{ payment.description }}
                           <span v-if="payment.tokens > 0" class="block text-[10px] text-primary font-bold mt-0.5">
                             ⚡ +{{ (payment.tokens / 1000).toFixed(0) }}k tokens
                           </span>
                        </td>
                        <td class="py-4 px-4 font-mono font-bold">
                           ${{ (payment.amount / 100).toFixed(2) }}
                        </td>
                        <td class="py-4 px-4 text-right last:rounded-r-xl">
                           <span :class="{
                             'bg-emerald-500/10 text-emerald-500 border-emerald-500/20': payment.status === 'completed',
                             'bg-amber-500/10 text-amber-500 border-amber-500/20': payment.status === 'pending',
                             'bg-red-500/10 text-red-500 border-red-500/20': payment.status === 'failed'
                           }" class="px-3 py-1 rounded-full text-[9px] font-black tracking-tighter border uppercase">
                             {{ payment.status }}
                           </span>
                        </td>
                     </tr>
                  </tbody>
               </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useEntitlements } from '@/composables/useEntitlements'
import { createCheckoutSession, createPortalSession, syncPayments, syncSubscription, createTokenCheckoutSession, createStorageCheckoutSession, getPayments, checkPaymentStatus } from '@/lib/api'
import { toast } from '@/composables/useNotifications'
import Slider from '@/components/ui/slider/Slider.vue'

defineOptions({ name: 'ProfilePage' })

const router = useRouter()
const { user, fetchUser, logout } = useAuth()
// Use global entitlements state
const { 
  subscriptionTier, 
  subscriptionStatus, 
  subscriptionDetails, 
  tierUsage, 
  fetchEntitlements, 
  isLoading: isEntitlementsLoading 
} = useEntitlements()

const isPageLoading = ref(true)
const typedUser = computed(() => user.value as any)

// Usage Stats (Computed from tierUsage or default)
const usageStats = computed(() => {
  if (tierUsage.value) {
    return {
      tokens: tierUsage.value.tokens?.current || 0,
      limit: tierUsage.value.tokens?.limit || 0,
      purchasedTokens: tierUsage.value.tokens?.purchased || 0,
      storage: tierUsage.value.storage?.current || 0,
      storageLimit: tierUsage.value.storage?.limit || 0,
      purchasedStorage: tierUsage.value.storage?.purchased || 0,
      storageFormatted: tierUsage.value.storage?.currentFormatted || '0 MB',
      storageLimitFormatted: tierUsage.value.storage?.limitFormatted || '0 MB'
    }
  }
  return { 
    tokens: 0, 
    limit: 0, 
    purchasedTokens: 0, 
    storage: 0, 
    storageLimit: 0,
    purchasedStorage: 0,
    storageFormatted: '0 MB',
    storageLimitFormatted: '0 MB'
  }
})

const syncing = ref(false)
const payments = ref<any[]>([])
const isLoadingPayments = ref(false)
const isVerifyingPayment = ref(false)

// Token Purchase State
const tokenPurchaseAmount = ref(1) // 1 unit = 100k
const isBuyingTokens = ref(false)

const tokenPurchaseList = computed({
  get: () => [tokenPurchaseAmount.value],
  set: (val: number[]) => {
    if (val && val.length > 0) {
      tokenPurchaseAmount.value = val[0] ?? 1
    }
  }
})

// Storage Purchase State
const storagePurchaseAmount = ref(1) // 1 unit = 1GB
const isBuyingStorage = ref(false)

// Tier-based storage configuration
const storageConfig = computed(() => {
  const tier = subscriptionTier.value
  const configs = {
    free: { pricePerGB: 2.00, maxGB: 25 },
    pro: { pricePerGB: 1.25, maxGB: 50 },
    pro_plus: { pricePerGB: 1.25, maxGB: 200 }
  }
  return configs[tier] || configs.free
})

const storageMaxGB = computed(() => storageConfig.value.maxGB)
const storagePricePerGB = computed(() => `$${storageConfig.value.pricePerGB.toFixed(2)}`)

const storageAtTierLimit = computed(() => {
  return storagePurchaseAmount.value >= storageMaxGB.value
})

const storageLimitMessage = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return `Free users can purchase up to ${storageMaxGB.value}GB`
  if (tier === 'pro') return `Pro users can purchase up to ${storageMaxGB.value}GB`
  return `Pro+ users can purchase up to ${storageMaxGB.value}GB`
})

const storageUpgradeTier = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return 'Pro'
  if (tier === 'pro') return 'Pro+'
  return ''
})

const storageUpgradeLimit = computed(() => {
  const tier = subscriptionTier.value
  if (tier === 'free') return 50
  if (tier === 'pro') return 200
  return 200
})

watch(storagePurchaseAmount, (val) => {
  const max = storageMaxGB.value
  if (val > max) storagePurchaseAmount.value = max
  if (val < 1 && val !== null) storagePurchaseAmount.value = 1
})

const storagePurchaseList = computed({
  get: () => [storagePurchaseAmount.value],
  set: (val: number[]) => {
    if (val && val.length > 0) {
      storagePurchaseAmount.value = val[0] ?? 1
    }
  }
})

const calculatedStoragePrice = computed(() => {
    return (storagePurchaseAmount.value * storageConfig.value.pricePerGB).toFixed(2)
})

const calculatedTokenPrice = computed(() => {
    const units = tokenPurchaseAmount.value
    const tier = subscriptionTier.value
    
    // Tier-based pricing (per 100k tokens)
    const tierPricing = {
      free: 12,      // $12.00
      pro: 8,        // $8.00 (33% discount)
      pro_plus: 6    // $6.00 (50% discount)
    }
    
    const pricePerUnit = tierPricing[tier] || tierPricing.free
    const finalPrice = units * pricePerUnit
    
    return finalPrice.toFixed(2)
})

const tokenDiscount = computed(() => {
    const units = tokenPurchaseAmount.value
    if (units >= 7) return 15
    if (units >= 3) return 10
    return 0
})

const handleBuyTokens = async () => {
    try {
        isBuyingTokens.value = true
        const result = await createTokenCheckoutSession(tokenPurchaseAmount.value)
        if (result && (result as any).url) window.location.href = (result as any).url
    } catch (e: any) {
        toast.error(e.message || 'Failed to initiate purchase')
    } finally {
        isBuyingTokens.value = false
    }
}

const handleBuyStorage = async () => {
    try {
        isBuyingStorage.value = true
        const result = await createStorageCheckoutSession(storagePurchaseAmount.value)
        if (result && (result as any).url) window.location.href = (result as any).url
    } catch (e: any) {
        toast.error(e.message || 'Failed to initiate purchase')
    } finally {
        isBuyingStorage.value = false
    }
}

const fetchPayments = async () => {
  isLoadingPayments.value = true
  try {
    // 1. Sync from Stripe source of truth first (updates DB if needed)
    await syncPayments()
    
    // 2. Fetch payments from our local DB
    const res = await getPayments()
    if (res.success) {
      payments.value = res.payments
    }

    // 3. Re-fetch usage stats to reflect any newly purchased tokens
    await fetchEntitlements(true)
  } catch (err) {
    console.error('Failed to fetch payments or usage:', err)
  } finally {
    isLoadingPayments.value = false
  }
}


onMounted(async () => {
  isPageLoading.value = true
  try {
    await fetchUser()
    if (typedUser.value) {
      // Check for Stripe Session ID to verify
      const params = new URLSearchParams(window.location.search)
      const sessionId = params.get('session_id')
      if (sessionId) {
          isVerifyingPayment.value = true
          // Poll for status
          let attempts = 0
          const maxAttempts = 20 // 20 * 1s = 20s timeout
          
          const poll = async () => {
              try {
                  const res = await checkPaymentStatus(sessionId)
                  if (res && res.status === 'completed') {
                      isVerifyingPayment.value = false
                      toast.success('Purchase confirmed & applied!')
                      // Clear Query Params
                      window.history.replaceState({}, '', '/profile')
                      // Reload everything
                      await fetchPayments()
                  } else {
                      attempts++
                      if (attempts < maxAttempts) {
                          setTimeout(poll, 1000)
                      } else {
                          isVerifyingPayment.value = false
                          toast.warning('Purchase verification timed out. It may appear shortly.')
                          await fetchPayments()
                      }
                  }
              } catch (e) {
                  console.error("Polling error", e)
                  isVerifyingPayment.value = false
              }
          }
          poll()
          return // Skip default fetch, poll will trigger it
      }

      // Start with payment sync (which now updates usage too)
      await fetchPayments()
      await fetchEntitlements(true)
    }
  } finally {
    isPageLoading.value = false
  }
})

const handleManageSubscription = () => {
  router.push('/pricing')
}

const handleUpgrade = () => {
  router.push('/pricing')
}

const handleSyncSubscription = async () => {
  syncing.value = true
  try {
    // 1. Force backend to sync with Stripe
    await syncSubscription()
    // 2. Refresh local state
    await fetchEntitlements(true)
    toast.success(`Synced!`)
  } catch (e) {
    toast.error('Failed to sync subscription')
  } finally {
    syncing.value = false
  }
}

const goToLogin = () => {
  router.push('/login')
}
</script>

<style scoped>
@keyframes spin-slow {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
.animate-spin-slow {
  animation: spin-slow 3s linear infinite;
}
@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(20%); }
  100% { transform: translateX(100%); }
}
.animate-progress-indeterminate {
  animation: progress-indeterminate 1.5s infinite linear;
}
</style>
