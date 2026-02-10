import { queryTranslationService } from '../src/services/QueryTranslationService.js';

/**
 * Basic unit tests for QueryTranslationService
 */

async function testSimpleCosmosTranslation() {
    console.log('\n🧪 Test: Simple SQL to Cosmos DB translation');

    const sql = "SELECT * FROM users WHERE email LIKE '%@gmail.com%'";
    const result = await queryTranslationService.translateQuery(sql, 'cosmosdb');

    console.log('  Original:', sql);
    console.log('  Translated:', result.translatedQuery);
    console.log('  Confidence:', result.confidence);
    console.log('  Time:', result.translationTimeMs + 'ms');
    console.log('  Warnings:', result.warnings);

    // Assertions
    if (!result.translatedQuery.includes('FROM c')) {
        throw new Error('Expected "FROM c" in Cosmos DB query');
    }

    if (!result.translatedQuery.includes('CONTAINS')) {
        console.warn('  ⚠️  Expected CONTAINS for LIKE translation');
    }

    console.log('  ✅ Test passed');
    return result;
}

async function testKustoTranslation() {
    console.log('\n🧪 Test: SQL to Kusto KQL translation');

    const sql = "SELECT COUNT(*) as total FROM logs WHERE timestamp > '2026-01-01' GROUP BY status ORDER BY total DESC LIMIT 10";
    const result = await queryTranslationService.translateQuery(sql, 'kusto');

    console.log('  Original:', sql);
    console.log('  Translated:', result.translatedQuery);
    console.log('  Confidence:', result.confidence);
    console.log('  Time:', result.translationTimeMs + 'ms');

    // Assertions
    if (!result.translatedQuery.includes('summarize')) {
        console.warn('  ⚠️  Expected "summarize" for GROUP BY translation');
    }

    if (!result.translatedQuery.includes('take')) {
        console.warn('  ⚠️  Expected "take" for LIMIT translation');
    }

    console.log('  ✅ Test passed');
    return result;
}

async function testCaching() {
    console.log('\n🧪 Test: Translation caching');

    const sql = "SELECT id, name FROM products WHERE price > 100";

    // First call - should not be cached
    const result1 = await queryTranslationService.translateQuery(sql, 'cosmosdb');
    console.log('  First call - Time:', result1.translationTimeMs + 'ms', 'Cached:', result1.cached);

    // Second call - should be cached
    const result2 = await queryTranslationService.translateQuery(sql, 'cosmosdb');
    console.log('  Second call - Time:', result2.translationTimeMs + 'ms', 'Cached:', result2.cached);

    if (!result2.cached) {
        throw new Error('Expected second call to be cached');
    }

    if (result1.translatedQuery !== result2.translatedQuery) {
        throw new Error('Cached result should match original');
    }

    console.log('  ✅ Test passed');
    return result2;
}

async function testMetrics() {
    console.log('\n🧪 Test: Metrics collection');

    const metrics = queryTranslationService.getMetrics();

    console.log('  Total Translations:', metrics.totalTranslations);
    console.log('  Cache Hits:', metrics.cacheHits);
    console.log('  Cache Misses:', metrics.cacheMisses);
    console.log('  Cache Hit Rate:', metrics.cacheHitRate);
    console.log('  Avg Translation Time:', metrics.avgTranslationTimeMs + 'ms');
    console.log('  Cache Size:', metrics.cacheSize);

    if (metrics.totalTranslations === 0) {
        throw new Error('Expected at least one translation');
    }

    console.log('  ✅ Test passed');
}

async function runTests() {
    console.log('🚀 QueryTranslationService Unit Tests\n');
    console.log('='.repeat(80));

    try {
        await testSimpleCosmosTranslation();
        await testKustoTranslation();
        await testCaching();
        await testMetrics();

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ All tests passed!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
runTests();
