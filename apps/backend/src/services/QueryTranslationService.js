import { aiClient } from '../../ai/AIClient.js';
import { DIALECTS } from '../../ai/prompts/dialects.js';

/**
 * QueryTranslationService
 * 
 * AI-powered SQL translation service that converts standard SQL queries
 * to native query languages (Cosmos DB SQL, Kusto KQL, etc.)
 * 
 * Features:
 * - AI-powered translation with dialect-specific rules
 * - LRU caching to avoid redundant AI calls
 * - Performance monitoring
 * - Confidence scoring and warnings
 */

class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;

        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);

        return value;
    }

    set(key, value) {
        // Remove if exists (to re-add at end)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

export class QueryTranslationService {
    constructor() {
        this.translationCache = new LRUCache(100);
        this.metrics = {
            totalTranslations: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalTranslationTimeMs: 0
        };
    }

    /**
     * Generate cache key for a translation request
     */
    getCacheKey(sqlQuery, targetDialect) {
        return `${targetDialect}:${sqlQuery.trim().toLowerCase()}`;
    }

    /**
     * Build translation prompt using dialect rules
     */
    buildTranslationPrompt(sqlQuery, targetDialect, schema = {}) {
        const dialect = DIALECTS[targetDialect];

        if (!dialect) {
            throw new Error(`Unsupported target dialect: ${targetDialect}`);
        }

        const translationRules = dialect.translationRules || {};
        const mappings = translationRules.mappings || {};
        const transformations = translationRules.transformations || [];
        const unsupportedFeatures = translationRules.unsupportedFeatures || [];

        let prompt = `You are a SQL translation expert. Convert the following standard SQL query to ${dialect.displayName} syntax.

ORIGINAL SQL QUERY:
\`\`\`sql
${sqlQuery}
\`\`\`

TARGET DIALECT: ${dialect.displayName}

`;

        // Add mappings
        if (Object.keys(mappings).length > 0) {
            prompt += `\nKEY SYNTAX MAPPINGS:\n`;
            for (const [sqlSyntax, nativeSyntax] of Object.entries(mappings)) {
                prompt += `- ${sqlSyntax} → ${nativeSyntax}\n`;
            }
        }

        // Add transformations
        if (transformations.length > 0) {
            prompt += `\nTRANSFORMATION EXAMPLES:\n`;
            transformations.forEach(example => {
                prompt += `- ${example}\n`;
            });
        }

        // Add unsupported features
        if (unsupportedFeatures.length > 0) {
            prompt += `\nUNSUPPORTED FEATURES (warn if detected):\n`;
            unsupportedFeatures.forEach(feature => {
                prompt += `- ${feature}\n`;
            });
        }

        // Add dialect-specific instructions
        if (dialect.instructions) {
            prompt += `\nDIALECT-SPECIFIC RULES:\n`;
            dialect.instructions.forEach(ins => {
                prompt += `- ${ins}\n`;
            });
        }

        // Add examples
        if (dialect.examples) {
            prompt += `\nBEST PRACTICE EXAMPLES:\n`;
            dialect.examples.forEach(ex => {
                prompt += `\`\`\`\n${ex}\n\`\`\`\n`;
            });
        }

        // Add schema context if available
        if (schema && (schema.columns || schema.mappings)) {
            prompt += `\nSCHEMA CONTEXT:\n`;
            if (schema.columns) {
                prompt += `Available columns: ${schema.columns.map(c => c.name || c).join(', ')}\n`;
            }
            if (schema.mappings && schema.mappings.columns) {
                prompt += `Column Mappings (Natural Name -> DB Name):\n`;
                Object.entries(schema.mappings.columns).forEach(([k, v]) => {
                    prompt += `- ${k} → ${v}\n`;
                });
            }
        }

        prompt += `\n
INSTRUCTIONS:
1. Translate the SQL query to ${dialect.displayName} syntax
2. Apply all necessary transformations based on the mappings above
3. If any unsupported features are detected, note them in warnings
4. Provide a confidence score (0-100) for the translation quality
5. Return ONLY a JSON object with this structure:

{
  "translatedQuery": "the translated query",
  "confidence": 95,
  "warnings": ["any warnings about unsupported features or potential issues"],
  "notes": "brief explanation of major transformations applied"
}

Return ONLY the JSON object, no additional text.`;

        return prompt;
    }

    /**
     * Translate a SQL query to target dialect
     * 
     * @param {string} sqlQuery - Standard SQL query to translate
     * @param {string} targetDialect - Target dialect (cosmosdb, kusto, etc.)
     * @param {object} schema - Optional schema context
     * @returns {Promise<object>} Translation result with query, confidence, warnings
     */
    async translateQuery(sqlQuery, targetDialect, schema = {}) {
        const startTime = performance.now();

        // Check cache first
        const cacheKey = this.getCacheKey(sqlQuery, targetDialect);
        const cached = this.translationCache.get(cacheKey);

        if (cached) {
            this.metrics.cacheHits++;
            return {
                ...cached,
                cached: true,
                translationTimeMs: 0
            };
        }

        this.metrics.cacheMisses++;
        this.metrics.totalTranslations++;

        try {
            // Build translation prompt
            const prompt = this.buildTranslationPrompt(sqlQuery, targetDialect, schema);

            // Call AI for translation
            const response = await aiClient.generateText(
                prompt,
                'gemini-2.0-flash', // Use stable flash model for translation
                {
                    temperature: 0.1, // Low temperature for consistent translations
                    maxTokens: 2000
                }
            );

            // Parse AI response
            let result;
            try {
                // Try to extract JSON from response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('No JSON found in response');
                }
            } catch (parseError) {
                // Fallback if AI doesn't return proper JSON
                result = {
                    translatedQuery: response.trim(),
                    confidence: 50,
                    warnings: ['AI response was not in expected JSON format'],
                    notes: 'Translation may need manual review'
                };
            }

            const endTime = performance.now();
            const translationTimeMs = Math.round(endTime - startTime);

            this.metrics.totalTranslationTimeMs += translationTimeMs;

            const translationResult = {
                originalQuery: sqlQuery,
                translatedQuery: result.translatedQuery || sqlQuery,
                dialect: targetDialect,
                confidence: result.confidence || 0,
                warnings: result.warnings || [],
                notes: result.notes || '',
                translationTimeMs,
                cached: false
            };

            // Cache the result
            this.translationCache.set(cacheKey, translationResult);

            return translationResult;

        } catch (error) {
            const endTime = performance.now();
            const translationTimeMs = Math.round(endTime - startTime);

            console.error('[QueryTranslationService] Translation failed:', error);

            return {
                originalQuery: sqlQuery,
                translatedQuery: sqlQuery, // Return original on error
                dialect: targetDialect,
                confidence: 0,
                warnings: [`Translation failed: ${error.message}`],
                notes: 'Error occurred during translation',
                translationTimeMs,
                cached: false,
                error: error.message
            };
        }
    }

    /**
     * Get translation metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.totalTranslations > 0
                ? (this.metrics.cacheHits / this.metrics.totalTranslations * 100).toFixed(1) + '%'
                : '0%',
            avgTranslationTimeMs: this.metrics.cacheMisses > 0
                ? Math.round(this.metrics.totalTranslationTimeMs / this.metrics.cacheMisses)
                : 0,
            cacheSize: this.translationCache.size
        };
    }

    /**
     * Clear translation cache
     */
    clearCache() {
        this.translationCache.clear();
    }
}

// Singleton instance
export const queryTranslationService = new QueryTranslationService();
