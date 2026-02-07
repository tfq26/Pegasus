
import { PromptBuilder } from './ai/PromptBuilder.js';

async function main() {
    console.log('[Test] Running Visualization Prompt Builder Test...');

    const userRequest = "Show me the distribution of server statuses";
    const data = [
        { status: 'online', count: 15 },
        { status: 'offline', count: 3 },
        { status: 'maintenance', count: 2 }
    ];

    // Generate blueprint using PromptBuilder (which now delegates to visualization.js)
    const prompt = PromptBuilder.buildVisualizationPrompt(userRequest, data, true);

    console.log('[Test] Generated Prompt Length:', prompt.length);
    console.log('[Test] Prompt Header Check:', prompt.includes('You are a data visualization expert.') ? 'PASS' : 'FAIL');
    console.log('[Test] Force Directive Check:', prompt.includes('DETECTION OVERRIDE') ? 'PASS' : 'FAIL');
    console.log('[Test] Data Inclusion Check:', prompt.includes('"status": "online"') ? 'PASS' : 'FAIL');

    if (prompt.length > 100) {
        console.log('✅ Visualization Prompt Generation: SUCCESS');
    } else {
        console.error('❌ Visualization Prompt Generation: FAILED (Prompt too short)');
        process.exit(1);
    }
}

main().catch(console.error);
