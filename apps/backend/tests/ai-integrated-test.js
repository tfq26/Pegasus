import { aiClient } from '../ai/AIClient.js';
import { spreadsheetToolService } from '../src/services/SpreadsheetToolService.js';

/**
 * AI-Integrated Tool Test
 * Tests tools with actual AI endpoint
 * Run with: node tests/ai-integrated-test.js
 * 
 * NOTE: Requires GEMINI_API_KEY or OPENAI_API_KEY environment variable
 * Example: GEMINI_API_KEY=your_key node tests/ai-integrated-test.js
 */

// Check if AI is configured
if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error('❌ Error: No AI API key found!');
    console.error('Please set GEMINI_API_KEY or OPENAI_API_KEY environment variable');
    console.error('Example: GEMINI_API_KEY=your_key node tests/ai-integrated-test.js');
    process.exit(1);
}

// Sample dataset
const sampleData = {
    headers: ['Fund Name', 'Value', 'Returns (%)', 'Category', 'Risk'],
    sampleData: [
        ['Kotak Large Cap Reg-G', 1656949, 38.08, 'Large Cap', 'Medium'],
        ['Axis Midcap Reg-G', 1591685, 35.46, 'Mid Cap', 'High'],
        ['HDFC Mid Cap Reg-G', 1076811, 12.17, 'Mid Cap', 'High'],
        ['Kotak Midcap Reg-G', 1769373, 20.37, 'Mid Cap', 'High'],
        ['Nippon India Small Cap-G', 770471, -0.91, 'Small Cap', 'Very High'],
        ['HDFC Liquid Reg-G', 785024, 3.68, 'Liquid', 'Low'],
        ['Kotak Liquid Reg-G', 421757, 8.35, 'Liquid', 'Low'],
        ['Kotak Balanced Advantage Reg-G', 932095, 86.42, 'Balanced', 'Medium'],
        ['ICICI Prudential Multi Asset-G', 2520118, 26.01, 'Multi Asset', 'Medium'],
        ['Mirae Asset Large Cap Reg-G', 886172, 67.83, 'Large Cap', 'Medium']
    ],
    rowCount: 11,
    colCount: 5
};

const testContext = {
    spreadsheetData: sampleData,
    userId: 'test-user'
};

// Color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'bright');
    console.log('='.repeat(60));
}

async function testAIWithTools(userRequest) {
    log(`\n🤖 Testing: "${userRequest}"`, 'cyan');

    try {
        // Get spreadsheet tools
        const tools = spreadsheetToolService.getSpreadsheetTools();

        // Build context for AI
        const { headers, sampleData: data, rowCount, colCount } = sampleData;
        const headerStr = headers.map((h, i) => `Col ${i}: ${h}`).join(', ');
        const dataStr = data.slice(0, 5).map((row, i) =>
            `Row ${i + 1}: ${row.join(' | ')}`
        ).join('\n');

        const systemPrompt = `You are an AI assistant for a spreadsheet editor. The user has a spreadsheet with the following data:

Headers: ${headerStr}
Sample Data (first 5 rows):
${dataStr}

Total Rows: ${rowCount}, Total Columns: ${colCount}

You have access to tools to perform various spreadsheet operations. Analyze the user's request and call the appropriate tool(s).

IMPORTANT: 
- For data analysis questions (e.g., "which fund has the highest value?"), use the analyze_data tool
- For calculations, use calculate_column and show the mathematical reasoning
- For formatting, use apply_conditional_formatting
- You can chain multiple tools if needed`;

        log('\n📤 Sending to AI...', 'blue');

        const response = await aiClient.generateContent([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userRequest }
        ], { tools });

        log('\n📥 AI Response:', 'blue');

        // Check for tool calls
        if (response.toolCalls && response.toolCalls.length > 0) {
            log(`\n✅ AI called ${response.toolCalls.length} tool(s)`, 'green');

            const toolResults = [];

            for (const toolCall of response.toolCalls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);

                log(`\n🔧 Tool: ${toolName}`, 'yellow');
                log('Arguments:', 'yellow');
                console.log(JSON.stringify(toolArgs, null, 2));

                // Execute the tool
                const result = await spreadsheetToolService.callTool(toolName, toolArgs, testContext);

                log('\n📊 Tool Result:', 'green');
                console.log(JSON.stringify(result, null, 2));

                toolResults.push({ toolName, result });
            }

            // For analyze_data tool, do a second AI call to get the actual answer
            const analyzeResult = toolResults.find(r => r.toolName === 'analyze_data');

            if (analyzeResult && analyzeResult.result.type === 'analysis_result') {
                log('\n🔄 Running natural language analysis on calculation result...', 'yellow');

                const { question, operation, result, headers } = analyzeResult.result;
                let resultContext = '';

                if (result.operation === 'maximum' || result.operation === 'minimum') {
                    resultContext = `The ${result.operation} value found is ${result.value}. 
The corresponding row data is: ${result.row.map((val, i) => `${headers[i]}: ${val}`).join(', ')}.`;
                } else if (result.operation === 'average' || result.operation === 'sum' || result.operation === 'count') {
                    resultContext = `The calculated ${result.operation} is ${result.value}${result.count ? ` (based on ${result.count} values)` : ''}.`;
                } else if (result.operation === 'group_by') {
                    resultContext = `Grouped analysis results:
${result.groups.map(g => `- ${g.group}: Count=${g.count}, Sum=${g.sum.toFixed(2)}, Average=${g.avg.toFixed(2)}`).join('\n')}`;
                }

                const followUpPrompt = `Based on the following calculation result from the spreadsheet, answer the user's question: "${question}"

Calculation Details:
- Operation: ${operation}
- Result: ${resultContext}

Provide a clear, helpful, and concise response to the user.`;

                const analysisResponse = await aiClient.generateContent([
                    { role: 'user', content: followUpPrompt }
                ]);

                log('\n💡 AI Analysis:', 'green');
                console.log(analysisResponse.text);

                // Update the result
                analyzeResult.result.answer = analysisResponse.text;
            }
        } else if (response.text) {
            log('\n💬 Text Response:', 'blue');
            console.log(response.text);
        } else {
            log('\n⚠️  No tool calls or text response', 'yellow');
        }

        log('\n✅ Test Complete', 'green');

    } catch (e) {
        log(`\n❌ Error: ${e.message}`, 'red');
        console.error(e);
    }
}

async function runTests() {
    logSection('🧪 AI-Integrated Tool Testing');
    log('Testing tools with actual AI endpoint\n', 'blue');

    const testPrompts = [
        "Which fund has the highest value?",
        "Highlight all funds with returns above 30% in green",
        "Calculate the profit margin for each fund",
        "Sort the funds by value from highest to lowest",
        "What's the average return across all funds?",
        "What is the average return for Mid Cap funds?"
    ];

    for (const prompt of testPrompts) {
        await testAIWithTools(prompt);

        // Wait a bit between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logSection('📊 TESTING COMPLETE');
    log('All AI-integrated tests finished!', 'green');
}

// Run tests
runTests().catch(console.error);
