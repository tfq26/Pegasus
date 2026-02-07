import { sign } from 'hono/jwt';

async function testVisualizationCommand() {
    console.log("🧪 Testing /visualization command...");

    // JWT Secret from .env
    const jwtSecret = "ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926";

    // Create a valid token
    const token = await sign({
        sub: 'test-user',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600
    }, jwtSecret);

    const prompt = "/visualization Create a line chart showing the AvgCPU usage over the last 2 hours, grouped by 10-minute intervals.";
    const start = Date.now();

    try {
        const response = await fetch('http://localhost:3000/ai/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                prompt: prompt,
                connectionId: 'none',
                activeTable: null
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let foundVisualization = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last incomplete line

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const chunk = JSON.parse(line);

                    if (chunk.type === 'tool_input' && chunk.tool === 'generate_visualization') {
                        console.log("✅ visualization tool requested via stream event 'tool_input'");
                        foundVisualization = true;
                    }

                    if (chunk.toolCalls) {
                        const vizCall = chunk.toolCalls.find(tc => tc.function.name === 'generate_visualization');
                        if (vizCall) {
                            console.log("✅ generate_visualization tool call found in final result");
                            foundVisualization = true;
                        }
                    }
                } catch (e) {
                    // ignore parse errors
                }
            }
        }

        console.log(`\nTest finished in ${Date.now() - start}ms`);

        if (foundVisualization) {
            console.log("🎉 SUCCESS: The AI was forced to use the visualization tool.");
            process.exit(0);
        } else {
            console.error("❌ FAILURE: The AI did NOT call the visualization tool.");
            process.exit(1);
        }

    } catch (error) {
        console.error("❌ Request failed:", error);
        process.exit(1);
    }
}

testVisualizationCommand();
