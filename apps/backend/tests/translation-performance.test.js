import { queryTranslationService } from '../src/services/QueryTranslationService.js';

/**
 * Performance Benchmarking Suite for SQL Translation
 * 
 * Measures translation time across different query complexities and dialects.
 * Target Performance:
 * - Simple queries: < 500ms
 * - Medium complexity: < 1000ms
 * - Complex queries: < 2000ms
 */

const TEST_CASES = [
    {
        name: 'Simple SELECT',
        sql: 'SELECT * FROM users WHERE id = 1',
        complexity: 'simple',
        targetMs: 500
    },
    {
        name: 'SELECT with LIKE',
        sql: "SELECT * FROM users WHERE email LIKE '%@gmail.com%'",
        complexity: 'simple',
        targetMs: 500
    },
    {
        name: 'Aggregation with GROUP BY',
        sql: 'SELECT country, COUNT(*) as total, AVG(age) as avg_age FROM users GROUP BY country',
        complexity: 'medium',
        targetMs: 1000
    },
    {
        name: 'Multiple Aggregations',
        sql: 'SELECT status, COUNT(*) as count, SUM(total) as revenue, AVG(total) as avg FROM orders GROUP BY status',
        complexity: 'medium',
        targetMs: 1000
    },
    {
        name: 'Complex JOIN',
        sql: 'SELECT u.name, u.email, o.id, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.total > 100',
        complexity: 'complex',
        targetMs: 2000
    },
    {
        name: 'Subquery',
        sql: 'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 1000)',
        complexity: 'complex',
        targetMs: 2000
    },
    {
        name: 'Time-based Aggregation',
        sql: "SELECT DATE(created_at) as day, COUNT(*) as orders FROM orders WHERE created_at > '2026-01-01' GROUP BY DATE(created_at)",
        complexity: 'medium',
        targetMs: 1000
    }
];

const DIALECTS = ['cosmosdb', 'kusto'];

async function benchmarkTranslation(testCase, dialect) {
    const startTime = performance.now();

    try {
        const result = await QueryTranslationService.translateQuery(
            testCase.sql,
            dialect,
            {} // Mock schema - can be enhanced
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        return {
            success: true,
            duration,
            translatedQuery: result.translatedQuery,
            confidence: result.confidence,
            withinTarget: duration <= testCase.targetMs
        };
    } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        return {
            success: false,
            duration,
            error: error.message,
            withinTarget: false
        };
    }
}

async function runBenchmarks() {
    console.log('🚀 SQL Translation Performance Benchmarks\n');
    console.log('Target Performance:');
    console.log('  - Simple queries: < 500ms');
    console.log('  - Medium complexity: < 1000ms');
    console.log('  - Complex queries: < 2000ms\n');
    console.log('='.repeat(80));

    const results = [];

    for (const dialect of DIALECTS) {
        console.log(`\n📊 Testing ${dialect.toUpperCase()} Translation\n`);

        for (const testCase of TEST_CASES) {
            process.stdout.write(`  ${testCase.name.padEnd(35)} ... `);

            const result = await benchmarkTranslation(testCase, dialect);
            results.push({
                dialect,
                testCase: testCase.name,
                ...result
            });

            const statusIcon = result.success ? '✅' : '❌';
            const targetIcon = result.withinTarget ? '🎯' : '⚠️';
            const durationStr = `${result.duration.toFixed(0)}ms`.padStart(6);
            const targetStr = `(target: ${testCase.targetMs}ms)`;

            console.log(`${statusIcon} ${targetIcon} ${durationStr} ${targetStr}`);

            if (!result.success) {
                console.log(`     Error: ${result.error}`);
            }
        }
    }

    // Summary Statistics
    console.log('\n' + '='.repeat(80));
    console.log('\n📈 Summary Statistics\n');

    const successRate = (results.filter(r => r.success).length / results.length * 100).toFixed(1);
    const targetMetRate = (results.filter(r => r.withinTarget).length / results.length * 100).toFixed(1);
    const avgDuration = (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(0);

    console.log(`  Success Rate:        ${successRate}%`);
    console.log(`  Target Met Rate:     ${targetMetRate}%`);
    console.log(`  Average Duration:    ${avgDuration}ms`);

    // Per-complexity breakdown
    console.log('\n  By Complexity:');
    for (const complexity of ['simple', 'medium', 'complex']) {
        const complexityResults = results.filter(r => {
            const testCase = TEST_CASES.find(tc => tc.name === r.testCase);
            return testCase?.complexity === complexity;
        });

        if (complexityResults.length > 0) {
            const avg = (complexityResults.reduce((sum, r) => sum + r.duration, 0) / complexityResults.length).toFixed(0);
            const met = (complexityResults.filter(r => r.withinTarget).length / complexityResults.length * 100).toFixed(0);
            console.log(`    ${complexity.padEnd(10)} - Avg: ${avg}ms, Target Met: ${met}%`);
        }
    }

    console.log('\n' + '='.repeat(80));

    // Exit with error if targets not met
    if (targetMetRate < 80) {
        console.error('\n❌ Performance targets not met! (< 80% success rate)');
        process.exit(1);
    } else {
        console.log('\n✅ Performance benchmarks passed!');
        process.exit(0);
    }
}

// Run benchmarks
runBenchmarks().catch(error => {
    console.error('Benchmark failed:', error);
    process.exit(1);
});
