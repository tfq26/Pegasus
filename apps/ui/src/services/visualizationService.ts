/**
 * Service for handling visualization logic, chart conversions, and refinements.
 */

const MUTED_COLORS = [
    '#9e829c',
    '#3a3e3b',
    '#291528',
    'hsl(258, 45%, 65%)',
    'hsl(195, 40%, 60%)',
    'hsl(155, 30%, 55%)',
    'hsl(30, 30%, 60%)',
    'hsl(350, 30%, 65%)',
    'hsl(180, 25%, 50%)',
    'hsl(280, 25%, 60%)',
    'hsl(215, 15%, 50%)',
]

export class VisualizationService {
    /**
     * Convert current config to a new chart type with appropriate styling
     */
    static convertToChartType(config: any, newType: string, results: any[] = []) {
        if (!config) return null

        // Handle Table specifically
        if (newType === 'table') {
            return {
                type: 'table',
                title: config.title,
                query: config.query,
                connectionId: config.connectionId,
                config: {
                    data: results
                }
            }
        }

        // Handle Stat specifically
        if (newType === 'stat') {
            const firstDataset = config.config?.data?.datasets?.[0]
            if (firstDataset && firstDataset.data?.length > 0) {
                return {
                    type: 'stat',
                    title: config.title,
                    config: {
                        value: firstDataset.data[0],
                        label: firstDataset.label || "Value"
                    }
                }
            }
            return null
        }

        const newConfig = JSON.parse(JSON.stringify(config))
        newConfig.type = newType

        // Cleanup line-specific properties
        if (newType !== 'area') {
            if (newConfig.config.data?.datasets) {
                newConfig.config.data.datasets.forEach((ds: any) => {
                    delete ds.fill
                })
            }
        }

        // Handle Bar/Horizontal Bar
        if (newType === 'bar' || newType === 'horizontalBar') {
            newConfig.type = 'bar'
            if (newConfig.config.data?.datasets) {
                newConfig.config.data.datasets.forEach((ds: any, i: number) => {
                    ds.backgroundColor = MUTED_COLORS[i % MUTED_COLORS.length]
                    delete ds.fill
                    delete ds.tension
                })
            }
            if (!newConfig.config.options) newConfig.config.options = {}
            newConfig.config.options.indexAxis = newType === 'horizontalBar' ? 'y' : 'x'
        }

        // Handle Line/Area
        else if (newType === 'line' || newType === 'area') {
            newConfig.type = 'line'
            if (newConfig.config.data?.datasets) {
                newConfig.config.data.datasets.forEach((ds: any, i: number) => {
                    const color = MUTED_COLORS[i % MUTED_COLORS.length] || '#888'
                    ds.borderColor = color
                    ds.backgroundColor = color.replace('%)', '%, 0.1)')
                    ds.tension = 0.4
                    ds.fill = newType === 'area'
                })
            }
        }

        return newConfig
    }

    /**
     * Update chart to use specific columns from results
     */
    static updateChartColumns(config: any, results: any[], columns: string[]) {
        if (!config || !results || results.length === 0) return null

        const newConfig = JSON.parse(JSON.stringify(config))
        const firstRow = results[0]
        const allColumns = Object.keys(firstRow)

        const categoryColumn = allColumns.find(col => {
            const val = firstRow[col]
            return typeof val === 'string' && !columns.includes(col)
        }) || allColumns[0]

        const numericColumns = columns.filter(col => {
            const val = firstRow[col]
            return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
        })

        if (numericColumns.length === 0) return null

        newConfig.config.data = {
            labels: results.map(r => r[categoryColumn!]),
            datasets: numericColumns.map((col, idx) => ({
                label: col,
                data: results.map(r => typeof r[col] === 'number' ? r[col] : parseFloat(r[col])),
                backgroundColor: newConfig.type === 'bar' ? MUTED_COLORS[idx % MUTED_COLORS.length] : undefined,
                borderColor: (newConfig.type === 'line' || newConfig.type === 'area') ? MUTED_COLORS[idx % MUTED_COLORS.length] : undefined,
                borderWidth: newConfig.type === 'bar' ? 1 : 2,
                tension: 0.4
            }))
        }

        newConfig.title = `${numericColumns.join(' vs ')} by ${categoryColumn}`
        return newConfig
    }
}
