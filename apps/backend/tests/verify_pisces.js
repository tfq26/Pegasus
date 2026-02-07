import { sign } from 'hono/jwt';

async function testPiscesAnalysis() {
    console.log("🧪 Testing Pisces Analysis...");

    // JWT Secret from .env
    const jwtSecret = "ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926";

    // Create a valid token
    const token = await sign({
        sub: 'test-user',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600
    }, jwtSecret);

    const errorPayload = {
        name: "CosmosError",
        message: "One of the input values is invalid. ActivityId: 2653841d-8287-44ff-923f-c183c79946f6, Windows/10.0.20348 cosmos-netstandard-sdk/3.18.0",
        stack: "at CosmosClient.CreateItemAsync ..."
    };

    // Simulate large logs to verify truncation
    let logs = "Log entry 1\nLog entry 2\n";
    for (let i = 0; i < 1000; i++) {
        logs += `Detailed log entry ${i} showing system state...\n`;
    }

    const payload = {
        error: errorPayload,
        userNotes: "The analysis is empty in pisces",
        logs: logs,
        metadata: { url: "http://localhost:3000/test" },
        timestamp: new Date().toISOString()
    };

    const start = Date.now();

    try {
        const response = await fetch('http://localhost:3000/support/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        console.log(`\nResponse received in ${Date.now() - start}ms`);

        if (data.success && data.analysis) {
            console.log("✅ Analysis success!");
            console.log("Diagnosis:", data.analysis.diagnosis);
            console.log("Fix:", data.analysis.suggested_fix);

            if (data.analysis.diagnosis === "Analysis incomplete.") {
                console.warn("⚠️ Analysis returned default fallback (incomplete).");
                process.exit(1);
            } else {
                console.log("🎉 SUCCESS: Valid analysis returned.");
                process.exit(0);
            }
        } else {
            console.error("❌ FAILURE: Invalid response structure", data);
            process.exit(1);
        }

    } catch (error) {
        console.error("❌ Request failed:", error);
        process.exit(1);
    }
}

testPiscesAnalysis();
