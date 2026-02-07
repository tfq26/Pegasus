
import { sign } from "hono/jwt";

async function testQueryById() {
    console.log("Testing query-by-id for OrionMetrics connection...");

    const secret = "ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926";
    const payload = {
        sub: "test_user_id", // This needs to be the owner ID usually, but let's see if we can bypass or if the connection is public/shared. 
        // The logs said "Requester: user:test_user_id". Owner was undefined in log? 
        // "Permission denied. Owner: undefined, Requester: user:user_01K8FGQG2NSJZJ7K38QFBS8CJD"
        // Wait, if owner is undefined, my patch in index.js might not help if it hits permission denied first.
        // But the error was "Adapter error", so it PASSED the permission check (or it was just a warning).
        // Line 1739 in index.js was a console.warn, not a return.

        email: "test@example.com",
        exp: Math.floor(Date.now() / 1000) + 3600
    };
    const token = await sign(payload, secret);

    const url = "http://localhost:3000/api/query-by-id";
    const connectionId = "93679098-01eb-48a0-a77d-35fd3630178c"; // From logs

    const body = {
        connectionId: connectionId,
        query: "SELECT TOP 5 * FROM c"
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
            console.log("Result:", JSON.stringify(data.result ? data.result.slice(0, 1) : data, null, 2));
        } else {
            console.error("❌ Failed. Status:", response.status);
            const text = await response.text();
            console.error("Response:", text);
        }

    } catch (e) {
        console.error("❌ Error running test:", e.message);
    }
}

testQueryById();
