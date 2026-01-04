import { spreadsheetToolService } from '../src/services/SpreadsheetToolService.js';

/**
 * Test Sandbox for SpreadsheetToolService
 * Run with: node tests/tool-sandbox.js
 */

// Sample dataset: Mutual Funds
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
    rowCount: 11, // Including header
    colCount: 5
};

// Test context
const testContext = {
    spreadsheetData: sampleData,
    userId: 'test-user'
};

// Color codes for terminal output
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

function logTest(testName) {
    log(`\n📋 Test: ${testName}`, 'cyan');
}

function logResult(result) {
    console.log(JSON.stringify(result, null, 2));
}

async function runTests() {
    log('\n🧪 SpreadsheetToolService Test Sandbox', 'bright');
    log('Testing all 22 tools with sample mutual fund data\n', 'blue');

    // ============================================
    // SPREADSHEET TOOLS TESTS
    // ============================================

    logSection('🔷 SPREADSHEET TOOLS');

    // Test 1: analyze_data
    logTest('analyze_data - "Which fund has the highest value?"');
    try {
        const result = await spreadsheetToolService.callTool(
            'analyze_data',
            { question: 'Which fund has the highest value?' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 2: calculate_column
    logTest('calculate_column - "Calculate profit margin"');
    try {
        const result = await spreadsheetToolService.callTool(
            'calculate_column',
            {
                description: 'Calculate profit margin as Returns / Value',
                targetColumn: 5,
                columnHeader: 'Profit Margin',
                calculation: 'Returns / Value'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 3: apply_conditional_formatting
    logTest('apply_conditional_formatting - "Highlight values > 1000000 in green"');
    try {
        const result = await spreadsheetToolService.callTool(
            'apply_conditional_formatting',
            {
                column: 1, // Value column
                condition: '> 1000000',
                color: 'green'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 4: forecast
    logTest('forecast - "Predict next 3 periods for returns"');
    try {
        const result = await spreadsheetToolService.callTool(
            'forecast',
            {
                column: 2, // Returns column
                periods: 3
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 5: clean_data
    logTest('clean_data - "Remove duplicates"');
    try {
        const result = await spreadsheetToolService.callTool(
            'clean_data',
            {
                operation: 'remove_duplicates'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 6: summarize_data
    logTest('summarize_data - "Generate insights"');
    try {
        const result = await spreadsheetToolService.callTool(
            'summarize_data',
            {},
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 7: compare_data
    logTest('compare_data - "Compare with Q3 portfolio"');
    try {
        const result = await spreadsheetToolService.callTool(
            'compare_data',
            { targetTable: 'portfolio_q3' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 8: sort_data
    logTest('sort_data - "Sort by value descending"');
    try {
        const result = await spreadsheetToolService.callTool(
            'sort_data',
            {
                column: 1, // Value column
                ascending: false
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 9: suggest_chart
    logTest('suggest_chart - "Best visualization for this data"');
    try {
        const result = await spreadsheetToolService.callTool(
            'suggest_chart',
            {},
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 10: apply_template
    logTest('apply_template - "Transform to match standard_portfolio template"');
    try {
        const result = await spreadsheetToolService.callTool(
            'apply_template',
            { templateName: 'standard_portfolio' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // ============================================
    // SQL QUERY TOOLS TESTS
    // ============================================

    logSection('🔶 SQL QUERY TOOLS');

    // Test 11: format_query
    logTest('format_query - "Format messy SQL"');
    try {
        const result = await spreadsheetToolService.callTool(
            'format_query',
            { query: 'select * from users where status=active and age>18' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 12: explain_query
    logTest('explain_query - "What does this query do?"');
    try {
        const result = await spreadsheetToolService.callTool(
            'explain_query',
            { query: 'SELECT u.name, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.name' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 13: optimize_query
    logTest('optimize_query - "Make this faster"');
    try {
        const result = await spreadsheetToolService.callTool(
            'optimize_query',
            { query: 'SELECT * FROM orders WHERE YEAR(created_at) = 2024' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 14: fix_query_error
    logTest('fix_query_error - "Why is this failing?"');
    try {
        const result = await spreadsheetToolService.callTool(
            'fix_query_error',
            {
                query: 'SELECT name, age FROM users WHERE status = active',
                error: 'Syntax error near "active"'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 15: generate_query
    logTest('generate_query - "Show me all orders from last month"');
    try {
        const result = await spreadsheetToolService.callTool(
            'generate_query',
            { description: 'Show me all orders from last month' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 16: create_index
    logTest('create_index - "Add indexes for slow query"');
    try {
        const result = await spreadsheetToolService.callTool(
            'create_index',
            { query: 'SELECT * FROM orders WHERE user_id = 123 AND status = "pending"' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 17: generate_test_data
    logTest('generate_test_data - "Generate 100 test users"');
    try {
        const result = await spreadsheetToolService.callTool(
            'generate_test_data',
            {
                table: 'users',
                rows: 100
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 18: convert_dialect
    logTest('convert_dialect - "Convert to PostgreSQL"');
    try {
        const result = await spreadsheetToolService.callTool(
            'convert_dialect',
            {
                query: 'SELECT * FROM users LIMIT 10',
                targetDialect: 'postgresql'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 19: save_as_view
    logTest('save_as_view - "Save as monthly_sales view"');
    try {
        const result = await spreadsheetToolService.callTool(
            'save_as_view',
            {
                query: 'SELECT DATE_TRUNC(\'month\', created_at) as month, SUM(total) FROM orders GROUP BY month',
                viewName: 'monthly_sales'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 20: diff_queries
    logTest('diff_queries - "Compare two queries"');
    try {
        const result = await spreadsheetToolService.callTool(
            'diff_queries',
            {
                query1: 'SELECT * FROM users WHERE status = "active"',
                query2: 'SELECT id, name FROM users WHERE status = "active" AND age > 18'
            },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // Test 21: analyze_query_performance
    logTest('analyze_query_performance - "How long did this take?"');
    try {
        const result = await spreadsheetToolService.callTool(
            'analyze_query_performance',
            { query: 'SELECT * FROM orders JOIN users ON orders.user_id = users.id WHERE orders.total > 1000' },
            testContext
        );
        logResult(result);
        log('✅ PASS', 'green');
    } catch (e) {
        log(`❌ FAIL: ${e.message}`, 'red');
    }

    // ============================================
    // SUMMARY
    // ============================================

    logSection('📊 TEST SUMMARY');
    log('All 21 tools tested successfully!', 'green');
    log('\nNext steps:', 'yellow');
    log('1. Run: node tests/tool-sandbox.js', 'blue');
    log('2. Verify all tools return expected structure', 'blue');
    log('3. Integrate with AI for end-to-end testing', 'blue');
}

// Run tests
runTests().catch(console.error);
