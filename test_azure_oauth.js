/**
 * Test script to validate Azure OAuth configuration
 * Run with: node test_azure_oauth.js
 */

import dotenv from 'dotenv';
dotenv.config({ path: './apps/backend/.env' });

const AZURE_CLIENT_ID = process.env.AZURE_OAUTH_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_OAUTH_CLIENT_SECRET;
const AZURE_REDIRECT_URI = process.env.AZURE_OAUTH_REDIRECT_URI;
const AZURE_TENANT = process.env.AZURE_OAUTH_TENANT || 'common';

console.log('🔍 Testing Azure OAuth Configuration\n');

// Test 1: Check environment variables
console.log('✅ Test 1: Environment Variables');
console.log(`   Client ID: ${AZURE_CLIENT_ID ? '✓ Set' : '✗ Missing'}`);
console.log(`   Client Secret: ${AZURE_CLIENT_SECRET ? '✓ Set' : '✗ Missing'}`);
console.log(`   Redirect URI: ${AZURE_REDIRECT_URI}`);
console.log(`   Tenant: ${AZURE_TENANT}\n`);

if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
}

// Test 2: Try different scope formats
console.log('🧪 Test 2: Testing Different Scope Formats\n');

const scopeVariants = [
    'https://management.azure.com/user_impersonation',
    'https://management.azure.com/.default',
    'https://management.core.windows.net/user_impersonation',
    'https://management.core.windows.net/.default',
    'user_impersonation',
];

async function testScope(scope) {
    const authUrl = new URL(`https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', AZURE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', AZURE_REDIRECT_URI);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', 'test-state');

    console.log(`   Testing scope: "${scope}"`);
    console.log(`   URL: ${authUrl.toString()}\n`);

    // Try to validate by making a request to the authorize endpoint
    try {
        const response = await fetch(authUrl.toString(), {
            method: 'GET',
            redirect: 'manual' // Don't follow redirects
        });

        // If we get a redirect to login, the scope is valid
        if (response.status === 302 || response.status === 200) {
            console.log(`   ✅ Scope appears valid (status: ${response.status})\n`);
            return true;
        } else {
            console.log(`   ⚠️  Unexpected status: ${response.status}\n`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
        return false;
    }
}

// Test each scope variant
for (const scope of scopeVariants) {
    await testScope(scope);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
}

console.log('\n📋 Summary:');
console.log('   Check the Azure Portal to verify:');
console.log('   1. API Permissions → Azure Service Management → user_impersonation is added');
console.log('   2. The redirect URI matches exactly');
console.log('   3. The app is not set to "Accounts in this organizational directory only" if using tenant "common"');
console.log('\n   Try opening one of the URLs above in a browser to see the actual Azure error message.');
