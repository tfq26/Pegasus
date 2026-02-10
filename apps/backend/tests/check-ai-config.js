#!/usr/bin/env bun

/**
 * Simple test to verify AI provider initialization
 * This helps diagnose why the translation service can't access AI
 */

console.log('🔍 Checking AI Provider Configuration\n');
console.log('='.repeat(80));

console.log('\n📋 Environment Variables:');
console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set (' + process.env.GEMINI_API_KEY.substring(0, 10) + '...)' : '❌ Not set'}`);
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set (' + process.env.OPENAI_API_KEY.substring(0, 10) + '...)' : '❌ Not set'}`);
console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`);

console.log('\n🤖 Importing AIClient...');
const { aiClient } = await import('../ai/AIClient.js');

console.log('\n📊 Available Providers:');
const providers = Array.from(aiClient.providers.keys());
if (providers.length > 0) {
    providers.forEach(provider => {
        console.log(`  ✅ ${provider}`);
    });
} else {
    console.log('  ❌ No providers configured!');
    console.log('\n💡 This is likely because:');
    console.log('  1. Environment variables are not loaded in test context');
    console.log('  2. The .env file needs to be loaded before importing AIClient');
    console.log('  3. API keys are stored in a different location (vault, etc.)');
}

console.log('\n' + '='.repeat(80));
console.log('\n✅ Diagnostic complete\n');
