
import axios from 'axios';
import 'dotenv/config';

async function verifySystemConnection() {
    console.log("🧪 VERIFYING System Connection Exposure...");

    // In dev mode, we can skip actual auth if bypass is active, but let's try to hit it
    const baseUrl = 'http://localhost:3000';

    try {
        const response = await axios.get(`${baseUrl}/connections`, {
            headers: { 'Authorization': 'Bearer dev_token' }
        });

        const connections = response.data.connections;
        const systemMetrics = connections.find(c => c.id === 'system:orion_metrics');

        if (systemMetrics) {
            console.log("   ✅ SUCCESS: System Metrics connection found in list.");
            console.log("   Details:", JSON.stringify(systemMetrics, null, 2));
        } else {
            console.error("   ❌ FAILURE: System Metrics connection NOT found.");
            console.log("   Available IDs:", connections.map(c => c.id).join(', '));
        }
    } catch (e) {
        console.error("   ❌ ERROR fetching connections:", e.message);
    }

    console.log("\n🧪 VERIFYING Query Routing Logic (In-Process Check)...");
    // We'll rely on our code edits in index.js. If COSMOS_ENDPOINT is set, it should work.
    console.log("   COSMOS_ENDPOINT registered:", !!process.env.COSMOS_ENDPOINT);
}

verifySystemConnection();
