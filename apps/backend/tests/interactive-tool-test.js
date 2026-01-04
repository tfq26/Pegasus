import { spreadsheetToolService } from '../src/services/SpreadsheetToolService.js';
import readline from 'readline';

/**
 * Interactive Tool Tester
 * Run with: node tests/interactive-tool-test.js
 */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

// Get all tool definitions
const allTools = spreadsheetToolService.getToolDefinitions();
const spreadsheetTools = spreadsheetToolService.getSpreadsheetTools();
const queryTools = spreadsheetToolService.getQueryTools();

function showMenu() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 Interactive Tool Tester');
    console.log('='.repeat(60));
    console.log('\nCommands:');
    console.log('  list              - List all tools');
    console.log('  list spreadsheet  - List spreadsheet tools');
    console.log('  list query        - List query tools');
    console.log('  test <tool_name>  - Test a specific tool');
    console.log('  data              - Show sample data');
    console.log('  help <tool_name>  - Show tool parameters');
    console.log('  exit              - Exit');
    console.log('');
}

function listTools(category = 'all') {
    let tools;
    let title;

    if (category === 'spreadsheet') {
        tools = spreadsheetTools;
        title = '🔷 Spreadsheet Tools';
    } else if (category === 'query') {
        tools = queryTools;
        title = '🔶 Query Tools';
    } else {
        tools = allTools;
        title = '📋 All Tools';
    }

    console.log(`\n${title} (${tools.length} total):`);
    tools.forEach((tool, i) => {
        console.log(`  ${i + 1}. ${tool.name}`);
        console.log(`     ${tool.description}`);
    });
}

function showData() {
    console.log('\n📊 Sample Data:');
    console.log('Headers:', sampleData.headers.join(' | '));
    console.log('\nRows:');
    sampleData.sampleData.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.join(' | ')}`);
    });
}

function showHelp(toolName) {
    const tool = allTools.find(t => t.name === toolName);
    if (!tool) {
        console.log(`❌ Tool "${toolName}" not found`);
        return;
    }

    console.log(`\n📖 ${tool.name}`);
    console.log(`Description: ${tool.description}`);
    console.log('\nParameters:');
    console.log(JSON.stringify(tool.parameters, null, 2));
}

async function testTool(toolName) {
    const tool = allTools.find(t => t.name === toolName);
    if (!tool) {
        console.log(`❌ Tool "${toolName}" not found`);
        return;
    }

    console.log(`\n🧪 Testing: ${toolName}`);
    console.log(`Description: ${tool.description}`);

    // Get example parameters based on tool
    const exampleParams = getExampleParams(toolName);

    console.log('\nExample parameters:');
    console.log(JSON.stringify(exampleParams, null, 2));

    try {
        const result = await spreadsheetToolService.callTool(toolName, exampleParams, testContext);
        console.log('\n✅ Result:');
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.log(`\n❌ Error: ${e.message}`);
    }
}

function getExampleParams(toolName) {
    const examples = {
        // Spreadsheet tools
        'analyze_data': { question: 'Which fund has the highest value?' },
        'calculate_column': {
            description: 'Calculate profit margin',
            targetColumn: 5,
            columnHeader: 'Profit Margin',
            calculation: 'Returns / Value'
        },
        'apply_conditional_formatting': {
            column: 1,
            condition: '> 1000000',
            color: 'green'
        },
        'forecast': { column: 2, periods: 3 },
        'clean_data': { operation: 'remove_duplicates' },
        'summarize_data': {},
        'compare_data': { targetTable: 'portfolio_q3' },
        'sort_data': { column: 1, ascending: false },
        'suggest_chart': {},
        'apply_template': { templateName: 'standard_portfolio' },

        // Query tools
        'format_query': { query: 'select * from users where status=active' },
        'explain_query': { query: 'SELECT u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.name' },
        'optimize_query': { query: 'SELECT * FROM orders WHERE YEAR(created_at) = 2024' },
        'fix_query_error': {
            query: 'SELECT name FROM users WHERE status = active',
            error: 'Syntax error near "active"'
        },
        'generate_query': { description: 'Show me all orders from last month' },
        'create_index': { query: 'SELECT * FROM orders WHERE user_id = 123' },
        'generate_test_data': { table: 'users', rows: 100 },
        'convert_dialect': { query: 'SELECT * FROM users LIMIT 10', targetDialect: 'postgresql' },
        'save_as_view': {
            query: 'SELECT DATE_TRUNC(\'month\', created_at) as month, SUM(total) FROM orders GROUP BY month',
            viewName: 'monthly_sales'
        },
        'diff_queries': {
            query1: 'SELECT * FROM users WHERE status = "active"',
            query2: 'SELECT id, name FROM users WHERE status = "active" AND age > 18'
        },
        'analyze_query_performance': {
            query: 'SELECT * FROM orders JOIN users ON orders.user_id = users.id WHERE orders.total > 1000'
        }
    };

    return examples[toolName] || {};
}

function prompt() {
    rl.question('\n> ', async (input) => {
        const [command, ...args] = input.trim().split(' ');

        switch (command) {
            case 'list':
                listTools(args[0]);
                break;
            case 'test':
                if (!args[0]) {
                    console.log('❌ Usage: test <tool_name>');
                } else {
                    await testTool(args[0]);
                }
                break;
            case 'data':
                showData();
                break;
            case 'help':
                if (!args[0]) {
                    showMenu();
                } else {
                    showHelp(args[0]);
                }
                break;
            case 'exit':
                console.log('👋 Goodbye!');
                rl.close();
                return;
            default:
                if (command) {
                    console.log(`❌ Unknown command: ${command}`);
                }
                showMenu();
        }

        prompt();
    });
}

// Start
showMenu();
prompt();
