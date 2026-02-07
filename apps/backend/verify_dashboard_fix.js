
import { sign } from "hono/jwt";

async function testDashboardFix() {
    console.log("Testing Dashboard Fix for OrionMetrics...");

    const secret = "ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926";
    const payload = {
        sub: "test_user_id",
        email: "test@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600
    };
    const token = await sign(payload, secret);

    const url = "http://localhost:3000/api/table/OrionMetrics/query";

    // Simulate the frontend sending an incomplete connection config (just provider)
    const body = {
        provider: "cosmosdb",
        connection: {
            provider: "cosmosdb"
            // Missing endpoint, key, database, container
        },
        limit: 5
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            const data = await response.json();
            console.log("✅ Success! Query executed.");
            console.log("Rows returned:", data.rows ? data.rows.length : 0);
            if (data.rows && data.rows.length > 0) {
                console.log("Sample Data:", JSON.stringify(data.rows[0], null, 2));
            }
        } else {
            console.error("❌ Failed. Status:", response.status);
            const text = await response.text();
            console.error("Response:", text);
        }

    } catch (e) {
        console.error("❌ Error running test:", e.message);
    }
}

testDashboardFix();
