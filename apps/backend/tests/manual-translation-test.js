import { queryTranslationService } from '../src/services/QueryTranslationService.js';

/**
 * Manual test script to verify SQL translation functionality
 * Run with: bun run apps/backend/tests/manual-translation-test.js
 */

console.log('🧪 Manual SQL Translation Test\n');
console.log('='.repeat(80));

async function testCosmosDBTranslation() {
    console.log('\n📝 Test 1: SQL → Cosmos DB Translation\n');

    const testCases = [
        {
            name: 'Simple SELECT with LIKE',
            sql: "SELECT * FROM users WHERE email LIKE '%@gmail.com%'"
        },
        {
            name: 'SELECT with LIMIT',
            sql: "SELECT id, name FROM products WHERE price > 100 LIMIT 10"
        },
        {
            name: 'Aggregation with GROUP BY',
            sql: "SELECT country, COUNT(*) as total FROM users GROUP BY country"
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n  ${testCase.name}`);
        console.log(`  Original SQL: ${testCase.sql}`);

        try {
            const result = await queryTranslationService.translateQuery(
                testCase.sql,
                'cosmosdb'
            );

            console.log(`  ✅ Translated:  ${result.translatedQuery}`);
            console.log(`  📊 Confidence:  ${result.confidence}%`);
            console.log(`  ⏱️  Time:        ${result.translationTimeMs}ms`);
            console.log(`  💾 Cached:      ${result.cached}`);

            if (result.warnings.length > 0) {
                console.log(`  ⚠️  Warnings:    ${result.warnings.join(', ')}`);
            }

            if (result.notes) {
                console.log(`  📝 Notes:       ${result.notes}`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
        }
    }
}

async function testKustoTranslation() {
    console.log('\n\n📝 Test 2: SQL → Kusto KQL Translation\n');

    const testCases = [
        {
            name: 'Simple SELECT with WHERE',
            sql: "SELECT name, status FROM servers WHERE cpu > 80"
        },
        {
            name: 'Aggregation with ORDER BY and LIMIT',
            sql: "SELECT status, COUNT(*) as total FROM logs GROUP BY status ORDER BY total DESC LIMIT 5"
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n  ${testCase.name}`);
        console.log(`  Original SQL: ${testCase.sql}`);

        try {
            const result = await queryTranslationService.translateQuery(
                testCase.sql,
                'kusto'
            );

            console.log(`  ✅ Translated:  ${result.translatedQuery}`);
            console.log(`  📊 Confidence:  ${result.confidence}%`);
            console.log(`  ⏱️  Time:        ${result.translationTimeMs}ms`);
            console.log(`  💾 Cached:      ${result.cached}`);

            if (result.warnings.length > 0) {
                console.log(`  ⚠️  Warnings:    ${result.warnings.join(', ')}`);
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
        }
    }
}

async function testCaching() {
    console.log('\n\n📝 Test 3: Translation Caching\n');

    const sql = "SELECT id, name FROM products WHERE active = true";

    console.log(`  Query: ${sql}\n`);

    // First call
    console.log('  First call (should NOT be cached):');
    const result1 = await queryTranslationService.translateQuery(sql, 'cosmosdb');
    console.log(`    Time: ${result1.translationTimeMs}ms, Cached: ${result1.cached}`);

    // Second call
    console.log('  Second call (should be cached):');
    const result2 = await queryTranslationService.translateQuery(sql, 'cosmosdb');
    console.log(`    Time: ${result2.translationTimeMs}ms, Cached: ${result2.cached}`);

    if (result2.cached && result2.translationTimeMs < 5) {
        console.log('  ✅ Caching works correctly!');
    } else {
        console.log('  ⚠️  Caching may not be working as expected');
    }
}

async function testMetrics() {
    console.log('\n\n📝 Test 4: Performance Metrics\n');

    const metrics = queryTranslationService.getMetrics();

    console.log('  Current Metrics:');
    console.log(`    Total Translations:    ${metrics.totalTranslations}`);
    console.log(`    Cache Hits:            ${metrics.cacheHits}`);
    console.log(`    Cache Misses:          ${metrics.cacheMisses}`);
    console.log(`    Cache Hit Rate:        ${metrics.cacheHitRate}`);
    console.log(`    Avg Translation Time:  ${metrics.avgTranslationTimeMs}ms`);
    console.log(`    Cache Size:            ${metrics.cacheSize}`);
}

async function runTests() {
    try {
        await testCosmosDBTranslation();
        await testKustoTranslation();
        await testCaching();
        await testMetrics();

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ All manual tests completed!\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests();
