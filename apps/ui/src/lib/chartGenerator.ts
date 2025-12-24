/**
 * Instant Chart Configuration Generator
 * 
 * Analyzes query results and generates a chart configuration without AI.
 * Uses heuristics to detect column types and pick appropriate chart type.
 */

interface ChartConfig {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'stat'
    title: string
    config: {
        data?: {
            labels: string[]
            datasets: Array<{
                label: string
                data: number[]
                backgroundColor?: string | string[]
                borderColor?: string | string[]
                borderWidth?: number
                tension?: number
                fill?: boolean
            }>
        }
        options?: any
        value?: number | string
        label?: string
    }
}

// Color palette for charts
const CHART_COLORS = [
    'hsl(258, 90%, 66%)',  // Violet
    'hsl(200, 90%, 60%)',  // Blue
    'hsl(150, 80%, 50%)',  // Green
    'hsl(40, 95%, 55%)',   // Yellow/Orange
    'hsl(350, 85%, 60%)',  // Red/Pink
    'hsl(180, 70%, 50%)',  // Teal
    'hsl(280, 70%, 60%)',  // Purple
    'hsl(30, 90%, 55%)',   // Orange
]

/**
 * Detect the type of a column based on sample values
 */
function detectColumnType(values: any[]): 'numeric' | 'categorical' | 'date' | 'mixed' {
    const sample = values.slice(0, 20).filter(v => v !== null && v !== undefined)
    if (sample.length === 0) return 'mixed'

    let numericCount = 0
    let dateCount = 0
    let stringCount = 0

    for (const val of sample) {
        if (typeof val === 'number') {
            numericCount++
        } else if (typeof val === 'string') {
            const num = parseFloat(val)
            if (!isNaN(num) && isFinite(num) && val.trim() !== '') {
                // Check if it looks like a pure number string
                if (/^-?\d+(\.\d+)?$/.test(val.trim())) {
                    numericCount++
                } else if (!isNaN(Date.parse(val)) && val.length > 6) {
                    dateCount++
                } else {
                    stringCount++
                }
            } else if (!isNaN(Date.parse(val)) && val.length > 6) {
                dateCount++
            } else {
                stringCount++
            }
        } else if (val instanceof Date) {
            dateCount++
        }
    }

    const total = sample.length
    if (numericCount / total > 0.8) return 'numeric'
    if (dateCount / total > 0.5) return 'date'
    if (stringCount / total > 0.5) return 'categorical'
    return 'mixed'
}

/**
 * Pick the best chart type based on data characteristics
 */
function pickChartType(
    categoryColumn: string | null,
    numericColumns: string[],
    dateColumn: string | null,
    rowCount: number
): 'bar' | 'line' | 'pie' | 'stat' {
    // Single value → Stat
    if (rowCount === 1 && numericColumns.length === 1) {
        return 'stat'
    }

    // Has date column → Line chart (time series)
    if (dateColumn && numericColumns.length > 0) {
        return 'line'
    }

    // Few categories → Pie
    if (categoryColumn && numericColumns.length === 1 && rowCount <= 8) {
        return 'pie'
    }

    // Default → Bar
    return 'bar'
}

/**
 * Generate chart configuration from query results
 */
export function generateChartConfig(data: any[], query?: string): ChartConfig | null {
    if (!data || data.length === 0) return null

    // Handle primitive arrays (e.g., SELECT VALUE)
    if (typeof data[0] !== 'object' || data[0] === null) {
        const values = data.map(v => typeof v === 'number' ? v : parseFloat(v)).filter(n => !isNaN(n))
        if (values.length === 1) {
            return {
                type: 'stat',
                title: 'Value',
                config: {
                    value: values[0],
                    label: 'Result'
                }
            }
        }
        return {
            type: 'bar',
            title: 'Values',
            config: {
                data: {
                    labels: data.map((_, i) => `Item ${i + 1}`),
                    datasets: [{
                        label: 'Value',
                        data: values,
                        backgroundColor: CHART_COLORS[0],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } }
                }
            }
        }
    }

    // Analyze columns
    const columns = Object.keys(data[0])
    const columnTypes: Record<string, 'numeric' | 'categorical' | 'date' | 'mixed'> = {}

    for (const col of columns) {
        const values = data.map(row => row[col])
        columnTypes[col] = detectColumnType(values)
    }

    // Find category, numeric, and date columns
    const categoricalColumns = columns.filter(c => columnTypes[c] === 'categorical')
    const numericColumns = columns.filter(c => columnTypes[c] === 'numeric')
    const dateColumns = columns.filter(c => columnTypes[c] === 'date')

    // No numeric columns → can't visualize meaningfully
    if (numericColumns.length === 0) {
        // Try to count occurrences of categorical values
        if (categoricalColumns.length > 0) {
            const countCol = categoricalColumns[0]!
            const counts: Record<string, number> = {}
            for (const row of data) {
                const val = String(row[countCol])
                counts[val] = (counts[val] || 0) + 1
            }
            const labels = Object.keys(counts)
            const values = Object.values(counts)

            return {
                type: labels.length <= 8 ? 'pie' : 'bar',
                title: `Count by ${countCol}`,
                config: {
                    data: {
                        labels,
                        datasets: [{
                            label: 'Count',
                            data: values,
                            backgroundColor: labels.length <= 8 ? CHART_COLORS.slice(0, labels.length) : CHART_COLORS[0],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: labels.length <= 8 } }
                    }
                }
            }
        }
        return null
    }

    // Pick best columns for visualization
    const categoryColumn = categoricalColumns[0] || null
    const dateColumn = dateColumns[0] || null
    const chartType = pickChartType(categoryColumn, numericColumns, dateColumn, data.length)

    // Generate labels
    let labels: string[]
    if (dateColumn) {
        labels = data.map(row => {
            const d = new Date(row[dateColumn])
            return isNaN(d.getTime()) ? String(row[dateColumn]) : d.toLocaleDateString()
        })
    } else if (categoryColumn) {
        labels = data.map(row => String(row[categoryColumn]))
    } else {
        labels = data.map((_, i) => `Row ${i + 1}`)
    }

    // Generate datasets
    const datasets = numericColumns.slice(0, 4).map((col, idx) => ({
        label: col,
        data: data.map(row => {
            const val = row[col]
            return typeof val === 'number' ? val : parseFloat(val) || 0
        }),
        backgroundColor: chartType === 'pie' || chartType === 'bar'
            ? (chartType === 'pie' ? CHART_COLORS.slice(0, data.length) : CHART_COLORS[idx])
            : undefined,
        borderColor: chartType === 'line' ? CHART_COLORS[idx] : undefined,
        borderWidth: chartType === 'bar' ? 0 : (chartType === 'line' ? 2 : undefined),
        tension: chartType === 'line' ? 0.4 : undefined,
        fill: chartType === 'line' ? false : undefined
    }))

    // Handle stat type
    if (chartType === 'stat') {
        const firstNumericCol = numericColumns[0]!
        return {
            type: 'stat',
            title: firstNumericCol,
            config: {
                value: data[0][firstNumericCol],
                label: categoryColumn ? String(data[0][categoryColumn]) : firstNumericCol
            }
        }
    }

    // Generate title
    const title = categoryColumn
        ? `${numericColumns.join(', ')} by ${categoryColumn}`
        : dateColumn
            ? `${numericColumns.join(', ')} over Time`
            : `${numericColumns.join(', ')}`

    return {
        type: chartType,
        title,
        config: {
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: numericColumns.length > 1 || chartType === 'pie' }
                }
            }
        }
    }
}
