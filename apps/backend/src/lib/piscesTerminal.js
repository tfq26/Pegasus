
import { aiClient } from '../../ai/AIClient.js';

export async function analyzeAndPrintToTerminal(error, context = {}) {
    if (process.env.NODE_ENV !== 'development' && process.env.PEGASUS_DEV_MODE !== 'true') return;

    try {
        console.log('\n\x1b[35m[Pisces] Analyzing backend error for immediate fix...\x1b[0m');

        const prompt = `
            You are Pisces, an expert SRE. A backend error just occurred. 
            Analyze it and provide a concise terminal report.

            ERROR: ${error.name}: ${error.message}
            STACK: ${error.stack}
            PATH: ${context.path || 'Unknown'}
            METHOD: ${context.method || 'Unknown'}

            Provide the response in this format:
            FIX: [Short fix recommendation]
            WHY: [Brief technical explanation]
            CODE: [One-line or short snippet if applicable]
        `;

        const response = await aiClient.generateContent([
            { role: 'system', content: 'You are a concise debugging assistant for the terminal. No yapping.' },
            { role: 'user', content: prompt }
        ]);

        console.log('\x1b[32m' + '─'.repeat(50));
        console.log('\x1b[1m\x1b[32m🧙 Pisces Fix Recommendation:\x1b[0m');
        console.log(response.text);
        console.log('\x1b[32m' + '─'.repeat(50) + '\x1b[0m\n');

    } catch (e) {
        // Silently fail terminal reporting to not cause more issues
    }
}
