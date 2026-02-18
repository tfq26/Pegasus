/**
 * Instant Chart Configuration Generator
 * 
 * Analyzes query results and generates a chart configuration without AI.
 * Uses heuristics to detect column types and pick appropriate chart type.
 */

interface ChartConfig {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'stat' | 'scatter' | 'radar' | 'polarArea' | 'bubble'
    title: string
    config: {
        data?: {
            labels: string[]
            datasets: Array<{
                label: string
                data: any[]
                backgroundColor?: string | string[]
                borderColor?: string | string[]
                borderWidth?: number
                tension?: number
                fill?: boolean
                pointRadius?: number
                showLine?: boolean
            }>
        }
        options?: any
        value?: number | string
        label?: string
    }
}

// Color palette for charts (Muted slate-like palette)
const CHART_COLORS = [
    '#9e829c', // User Muted Purple
    '#3a3e3b', // User Slate Gray
    '#291528', // User Deep Purple
    'hsl(258, 45%, 65%)',  // Pegasus Purple (Muted)
    'hsl(195, 40%, 60%)',  // Slate Blue
    'hsl(180, 25%, 50%)',  // Slate Teal
    'hsl(280, 25%, 60%)',  // Muted Lavender
    'hsl(215, 15%, 50%)',  // Deep Slate
]

// Label truncation settings
const MAX_LABEL_LENGTH = 12

/**
 * Truncate a label to a maximum length with ellipsis
 */
function truncateLabel(label: string): string {
    if (!label || label.length <= MAX_LABEL_LENGTH) return label
    return label.substring(0, MAX_LABEL_LENGTH) + '...'
}

/**
 * Detect the type of a column based on sample values
 */
function detectColumnType(values: any[]): 'numeric' | 'categorical' | 'date' | 'mixed' {
    const sample = values.slice(0, 20).filter(v => v !== null && v !== undefined && v !== '')
    if (sample.length === 0) return 'mixed'

    let numericCount = 0
    let dateCount = 0
    let stringCount = 0

    // Strict date patterns (YYYY-MM-DD, MM/DD/YYYY, DD-Mon-YYYY, etc.)
    const datePatterns = [
        /^\d{4}-\d{2}-\d{2}/, // ISO: 2024-01-15
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // US: 1/15/2024 or 01/15/24
        /^\d{1,2}-\d{1,2}-\d{2,4}$/, // EU: 15-01-2024
        /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i, // 15 Jan 2024
    ]

    for (const val of sample) {
        if (typeof val === 'number') {
            numericCount++
        } else if (typeof val === 'string') {
            const trimmed = val.trim()

            // Check if it looks like a pure number string
            if (/^-?[\d,]+(\.\d+)?$/.test(trimmed.replace(/,/g, ''))) {
                numericCount++
            } else if (datePatterns.some(p => p.test(trimmed))) {
                // Only count as date if it matches a strict date pattern
                const parsed = Date.parse(trimmed)
                if (!isNaN(parsed)) {
                    const year = new Date(parsed).getFullYear()
                    // Sanity check: year should be reasonable (1900-2100)
                    if (year >= 1900 && year <= 2100) {
                        dateCount++
                    } else {
                        stringCount++
                    }
                } else {
                    stringCount++
                }
            } else {
                stringCount++
            }
        } else if (val instanceof Date) {
            dateCount++
        }
    }

    const total = sample.length
    if (numericCount / total > 0.8) return 'numeric'
    if (dateCount / total > 0.7) return 'date' // Raised threshold
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
): ChartConfig['type'] {
    // Single value → Stat
    if (rowCount === 1 && numericColumns.length === 1) {
        return 'stat'
    }

    // Two numeric columns with many rows and no strong category → Scatter
    if (numericColumns.length >= 2 && !categoryColumn && !dateColumn && rowCount > 10) {
        return 'scatter'
    }

    // Many numeric columns with a central category → Radar
    if (numericColumns.length >= 3 && categoryColumn && rowCount <= 10) {
        return 'radar'
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
export function generateChartConfig(data: any[], query?: string, options: { xAxis?: string, yAxis?: string[] } = {}): ChartConfig | null {
    if (!data || data.length === 0) return null

    // Override detection if xAxis and yAxis are provided
    const userXAxis = options.xAxis;
    const userYAxis = options.yAxis;

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
                        backgroundColor: CHART_COLORS, // Use full palette for multi-color bar
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false, position: 'bottom' } }
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
    const numericColumns = userYAxis ? userYAxis.filter(c => columns.includes(c)) : columns.filter(c => columnTypes[c] === 'numeric')
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
                            backgroundColor: labels.length <= CHART_COLORS.length ? CHART_COLORS.slice(0, labels.length) : CHART_COLORS,
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: labels.length <= CHART_COLORS.length, position: 'bottom' } }
                    }
                }
            }
        }
        return null
    }

    // Pick best columns for visualization
    const categoryColumn = userXAxis && columns.includes(userXAxis) ? userXAxis : (categoricalColumns[0] || null)
    const dateColumn = userXAxis && dateColumns.includes(userXAxis) ? userXAxis : (dateColumns[0] || null)
    const chartType = pickChartType(categoryColumn, numericColumns, dateColumn, data.length)

    // Generate labels with smart time formatting
    let labels: string[]
    let fullLabels: string[]
    let shouldAggregate = data.length > 50 && dateColumn !== null

    if (dateColumn) {
        // Parse all timestamps
        const timestamps = data.map(row => {
            const d = new Date(row[dateColumn])
            return { date: d, valid: !isNaN(d.getTime()), row }
        })

        const validTimestamps = timestamps.filter(t => t.valid)

        if (validTimestamps.length === 0) {
            // Fallback to string labels
            labels = data.map(row => String(row[dateColumn]))
            fullLabels = labels
            shouldAggregate = false
        } else {
            // Determine time range
            const dates = validTimestamps.map(t => t.date.getTime())
            const minTime = Math.min(...dates)
            const maxTime = Math.max(...dates)
            const rangeMs = maxTime - minTime

            // Time range constants
            const HOUR = 3600000
            const DAY = 86400000
            const WEEK = 7 * DAY
            const MONTH = 30 * DAY

            // Smart formatting based on range
            let formatLabel: (d: Date) => string

            if (rangeMs < 6 * HOUR) {
                // Last few hours → show time only (HH:MM)
                formatLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            } else if (rangeMs < DAY) {
                // Last 24 hours → show time (HH:MM AM/PM)
                formatLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            } else if (rangeMs < WEEK) {
                // Last week → show day + time
                formatLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', hour12: true })
            } else if (rangeMs < MONTH) {
                // Last month → show date
                formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            } else {
                // Longer → show month/year
                formatLabel = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            }

            // Aggregate if too many points
            if (shouldAggregate) {
                const targetBuckets = 30
                const bucketSize = Math.ceil(data.length / targetBuckets)
                const aggregated: any[] = []

                for (let i = 0; i < data.length; i += bucketSize) {
                    const bucket = data.slice(i, i + bucketSize)
                    const bucketTime = new Date(bucket[0][dateColumn])

                    // Average numeric values in this bucket
                    const aggregatedRow: any = { [dateColumn]: bucket[0][dateColumn] }
                    for (const numCol of numericColumns) {
                        const values = bucket.map(r => {
                            const val = r[numCol]
                            return typeof val === 'number' ? val : parseFloat(val) || 0
                        })
                        aggregatedRow[numCol] = values.reduce((a, b) => a + b, 0) / values.length
                    }
                    aggregated.push(aggregatedRow)
                }

                // Use aggregated data
                data = aggregated
                labels = aggregated.map(row => formatLabel(new Date(row[dateColumn])))
                fullLabels = aggregated.map(row => new Date(row[dateColumn]).toLocaleString())
            } else {
                labels = validTimestamps.map(t => formatLabel(t.date))
                fullLabels = validTimestamps.map(t => t.date.toLocaleString())
            }
        }
    } else if (categoryColumn) {
        fullLabels = data.map(row => String(row[categoryColumn]))
        labels = fullLabels.map(truncateLabel)
    } else {
        labels = data.map((_, i) => `Row ${i + 1}`)
        fullLabels = labels
    }

    // Generate datasets
    const datasets = numericColumns.slice(0, 4).map((col, idx) => ({
        label: col,
        data: data.map(row => {
            const val = row[col]
            return typeof val === 'number' ? val : parseFloat(val) || 0
        }),
        backgroundColor: chartType === 'pie' || (chartType === 'bar' && numericColumns.length === 1)
            ? CHART_COLORS.slice(0, Math.min(data.length, CHART_COLORS.length))
            : CHART_COLORS[idx % CHART_COLORS.length],
        borderColor: chartType === 'line' ? CHART_COLORS[idx % CHART_COLORS.length] : undefined,
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
                    legend: {
                        display: numericColumns.length > 1 || chartType === 'pie',
                        position: 'bottom'
                    },
                    fullLabels // Store full labels for tooltip display
                },
                scales: chartType === 'pie' ? undefined : {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: dateColumn || categoryColumn || ''
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: numericColumns.length === 1 ? numericColumns[0] : 'Value'
                        }
                    }
                }
            }
        }
    }
}
