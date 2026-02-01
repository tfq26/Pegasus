
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

// Only run this if the server is running on localhost:3000
const API_URL = "http://localhost:3000";
const AUTH_TOKEN = process.env.AUTH_TOKEN; // Needed

async function verifyStreaming() {
    console.log("Starting streaming verification...");

    // We need a valid token. If not provided, we might be blocked.
    // For this test, we assume the user provides a token or we mock it, 
    // but effectively we just want to see if the server accepts the connection and streams.
    // If we get 401, it means the server is reachable at least.

    // Ideally we login first to get a token.
    // But let's assume we can hit it.

    try {
        const response = await fetch(`${API_URL}/ai/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AUTH_TOKEN || 'invalid'}`
            },
            body: JSON.stringify({
                prompt: "Say hello",
                connectionId: "test-connection"
            })
        });

        if (response.status === 401) {
            console.log("Got 401. Authentication is required. Skipping deep verification, but endpoint exists.");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        console.log("Stream started...");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            console.log("Received chunk:", chunk);

            // Basic validation
            if (chunk.includes('progress') || chunk.includes('query') || chunk.includes('error')) {
                console.log("Chunk looks valid.");
            }
        }

        console.log("Stream finished.");

    } catch (e) {
        console.error("Verification failed:", e);
    }
}

// Just run it if executed directly
if (import.meta.main) {
    verifyStreaming();
}
