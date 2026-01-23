/**
 * SchemaTranslator Service
 * 
 * Provides a conversion layer between database schemas (with special characters)
 * and AI-friendly normalized names. This ensures the AI never has to deal with
 * special characters, backticks, or database-specific escaping.
 * 
 * Flow:
 * 1. normalize() - Convert raw schema to AI-friendly format
 * 2. AI generates query using normalized names
 * 3. denormalizeQuery() - Convert AI query back to original column names
 */

export class SchemaTranslator {
    constructor() {
        // Maps: normalizedName -> originalName
        this.columnMapping = new Map()
        // Maps: originalName -> normalizedName (reverse lookup)
        this.reverseMapping = new Map()
        // Track table names too
        this.tableMapping = new Map()
        this.reverseTableMapping = new Map()
    }

    /**
     * Normalize a column/table name to be AI-friendly
     * - Replace spaces with underscores
     * - Remove special characters
     * - Convert to lowercase
     * - Handle edge cases like starting with numbers
     */
    normalizeIdentifier(name) {
        if (!name || typeof name !== 'string') return name

        let normalized = name
            .toLowerCase()
            // Replace common symbols with semantic names
            .replace(/%/g, '_pct')
            .replace(/\$/g, '_usd')
            .replace(/€/g, '_eur')
            .replace(/£/g, '_gbp')
            .replace(/\+/g, '_plus')
            .replace(/-/g, '_')
            .replace(/\//g, '_')
            // Replace spaces and remaining special chars with underscores
            .replace(/[\s\.\(\)\[\]\{\}\#\@\!\?\*\&\^\=\<\>\,\:\;\'\"]/g, '_')
            // Collapse multiple underscores
            .replace(/_+/g, '_')
            // Remove leading/trailing underscores
            .replace(/^_+|_+$/g, '')

        // If it starts with a number, prefix with 'col_'
        if (/^\d/.test(normalized)) {
            normalized = 'col_' + normalized
        }

        // If empty after normalization, use a placeholder
        if (!normalized) {
            normalized = 'column'
        }

        return normalized
    }

    /**
     * Check if a name needs normalization (has special characters)
     */
    needsNormalization(name) {
        if (!name || typeof name !== 'string') return false
        return /[\s\(\)\.\/%\$\-\+\#\@\!\?\*\&\^\=\<\>\,\:\;\'\"]/g.test(name)
    }

    /**
     * Normalize a schema object for AI consumption
     * Returns { normalizedSchema, translator } where translator can denormalize queries
     */
    normalizeSchema(schemaInfo) {
        // Reset mappings for this schema
        this.columnMapping.clear()
        this.reverseMapping.clear()
        this.tableMapping.clear()
        this.reverseTableMapping.clear()

        const normalizedSchema = {
            tables: [],
            detailedSchema: {},
            sampleValues: {}
        }

        // Normalize table names
        for (const tableName of schemaInfo.tables || []) {
            if (this.needsNormalization(tableName)) {
                const normalized = this.normalizeIdentifier(tableName)
                this.tableMapping.set(normalized, tableName)
                this.reverseTableMapping.set(tableName, normalized)
                normalizedSchema.tables.push(normalized)
            } else {
                normalizedSchema.tables.push(tableName)
            }
        }

        // Normalize detailed schema (column definitions)
        for (const [tableName, columns] of Object.entries(schemaInfo.detailedSchema || {})) {
            const normalizedTableName = this.reverseTableMapping.get(tableName) || tableName
            const normalizedColumns = []

            for (const col of columns || []) {
                const originalName = col.name
                let normalizedName = originalName

                if (this.needsNormalization(originalName)) {
                    normalizedName = this.normalizeIdentifier(originalName)

                    // Handle duplicate normalized names by adding suffix
                    let uniqueName = normalizedName
                    let counter = 1
                    while (this.columnMapping.has(uniqueName) && this.columnMapping.get(uniqueName) !== originalName) {
                        uniqueName = `${normalizedName}_${counter++}`
                    }
                    normalizedName = uniqueName

                    // Store bidirectional mapping
                    this.columnMapping.set(normalizedName, originalName)
                    this.reverseMapping.set(originalName, normalizedName)
                }

                normalizedColumns.push({
                    ...col,
                    name: normalizedName,
                    originalName: originalName // Keep original for reference
                })
            }

            normalizedSchema.detailedSchema[normalizedTableName] = normalizedColumns
        }

        // Normalize sample values
        for (const [tableName, fields] of Object.entries(schemaInfo.sampleValues || {})) {
            const normalizedTableName = this.reverseTableMapping.get(tableName) || tableName
            normalizedSchema.sampleValues[normalizedTableName] = {}

            for (const [fieldName, values] of Object.entries(fields || {})) {
                const normalizedFieldName = this.reverseMapping.get(fieldName) || fieldName
                normalizedSchema.sampleValues[normalizedTableName][normalizedFieldName] = values
            }
        }

        return normalizedSchema
    }

    /**
     * Denormalize a query - replace normalized names with original names
     * Handles table and column names
     */
    denormalizeQuery(query, provider = 'surrealdb') {
        if (!query || typeof query !== 'string') return query
        if (query.startsWith('{')) return query // JSON response, don't modify

        let result = query

        // Replace normalized column names with original (wrapped in backticks for SurrealDB)
        for (const [normalized, original] of this.columnMapping.entries()) {
            // Use word boundaries to avoid partial replacements
            const pattern = new RegExp(`\\b${this.escapeRegex(normalized)}\\b`, 'gi')

            // Choose appropriate quoting based on provider
            let quoted = original
            if (provider === 'surrealdb' && this.needsNormalization(original)) {
                quoted = `\`${original}\``
            } else if ((provider === 'postgres' || provider === 'sqlite' || provider === 'duckdb') && this.needsNormalization(original)) {
                quoted = `"${original}"`
            } else if (provider === 'mysql' && this.needsNormalization(original)) {
                quoted = `\`${original}\``
            }

            result = result.replace(pattern, quoted)
        }

        // Replace normalized table names with original
        for (const [normalized, original] of this.tableMapping.entries()) {
            const pattern = new RegExp(`\\b${this.escapeRegex(normalized)}\\b`, 'gi')

            let quoted = original
            if (provider === 'surrealdb' && this.needsNormalization(original)) {
                quoted = `\`${original}\``
            }

            result = result.replace(pattern, quoted)
        }

        return result
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    /**
     * Get a human-readable mapping summary (for debugging)
     */
    getMappingSummary() {
        return {
            columns: Object.fromEntries(this.columnMapping),
            tables: Object.fromEntries(this.tableMapping)
        }
    }

    /**
     * Check if any mappings exist (schema had special chars)
     */
    hasNormalizations() {
        return this.columnMapping.size > 0 || this.tableMapping.size > 0
    }
}

// Singleton instance for convenience
export const schemaTranslator = new SchemaTranslator()
