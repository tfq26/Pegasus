
import { sign } from "hono/jwt";

async function testAggregateQuery() {
    console.log("Testing aggregate query for CPU usage visualization...");

    const secret = "ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926";
    const payload = {
        sub: "test_user_id",
        email: "test@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600
    };
    const token = await sign(payload, secret);

    const url = "http://localhost:3000/api/query-by-id";
    const connectionId = "93679098-01eb-48a0-a77d-35fd3630178c";

    // Simulating the exact query that failed in the logs
    const body = {
        connectionId: connectionId,
        query: "SELECT timestamp, AVG(cpuPercent) as avg_cpu FROM orion_metrics GROUP BY timestamp ORDER BY timestamp ASC"
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
            console.log("✅ Success! Aggregate query executed.");
            console.log("Result count:", data.result ? data.result.length : 0);
            if (data.result && data.result.length > 0) {
                console.log("Sample Result:", JSON.stringify(data.result.slice(0, 3), null, 2));
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

testAggregateQuery();
