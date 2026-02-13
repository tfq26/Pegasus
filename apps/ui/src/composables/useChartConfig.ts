import { computed } from 'vue'
import { toggleTimeFormat, cleanDateString } from '@/utils/formatters'

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

export function useChartConfig(props: { type: string, data: any, options: any, customization?: any }, emit?: any) {

    const computedData = computed(() => {
        if (!props.data) return { labels: [], datasets: [] }
        let data;
        try {
            data = JSON.parse(JSON.stringify(props.data))
        } catch (e) {
            return { labels: [], datasets: [] }
        }

        // Guard against missing datasets which causes vue-chartjs to crash
        if (!data.datasets) data.datasets = []

        // Apply custom labels (overrides axis/category labels)
        if (props.customization?.labels && data.labels) {
            data.labels = data.labels.map((label: any, index: number) => {
                const customLabel = props.customization.labels?.[index]
                if (customLabel) return customLabel
                return label
            })
        }

        // Auto-format Date labels for cleaner visualization (e.g. 2026-01-12 -> 1/12/26)
        if (data.labels && data.labels.length > 0) {
            const firstLabel = data.labels[0]
            const looksLikeDate = typeof firstLabel === 'string' && (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(firstLabel) || /^\d{2}[-/]\d{2}[-/]\d{2,4}/.test(firstLabel))

            if (looksLikeDate) {
                data.labels = data.labels.map((l: any) => {
                    if (typeof l !== 'string') return l
                    const cleanDateStr = cleanDateString(l)
                    const date = new Date(cleanDateStr)

                    if (isNaN(date.getTime())) return l

                    const formattedDate = date.toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        year: '2-digit'
                    })

                    const parts = l.split(' ')
                    const suffix = parts.find((p: string) => p.includes('AM') || p.includes('PM') || p.includes('h') || p.includes('-')) || ''
                    return suffix ? `${formattedDate} ${suffix}` : formattedDate
                })
            }
        }

        // Time format toggle (12h/24h)
        if (props.customization?.use24HourTime !== undefined && data.labels) {
            const use24h = props.customization.use24HourTime
            data.labels = data.labels.map((l: any) => toggleTimeFormat(l, use24h))
        }

        if (props.customization?.colorPalette?.shades && data.datasets?.[0]) {
            const shades = props.customization.colorPalette.shades
            const isLineChart = props.type === 'line' || props.type === 'area'

            data.datasets[0].backgroundColor = isLineChart ? shades[0] : shades
            data.datasets[0].borderColor = isLineChart ? shades[0] : shades

            if (isLineChart) {
                data.datasets[0].borderWidth = 2
                data.datasets[0].pointRadius = 4
                data.datasets[0].pointBackgroundColor = shades[0]
                data.datasets[0].fill = props.type === 'area'
                data.datasets[0].showLine = true
            }
        }

        const isLineOrArea = props.type === 'line' || props.type === 'area'
        if (isLineOrArea && data.datasets && data.datasets.length > 0) {
            const dataset = data.datasets[0]
            dataset.showLine = dataset.showLine ?? true
            dataset.spanGaps = dataset.spanGaps ?? true
            dataset.fill = dataset.fill ?? false

            if (props.customization?.smoothLines) dataset.tension = 0.4
            if (props.customization?.fillArea) dataset.fill = true

            if (props.customization?.showPoints === false) {
                dataset.pointRadius = 0
                dataset.pointHoverRadius = 0
            } else if (props.customization?.pointRadius) {
                dataset.pointRadius = props.customization.pointRadius
            }

            if (props.customization?.lineThickness) {
                dataset.borderWidth = props.customization.lineThickness
            }

            if (props.customization?.lineStyle === 'dashed') {
                dataset.borderDash = [5, 5]
            } else if (props.customization?.lineStyle === 'dotted') {
                dataset.borderDash = [2, 2]
            } else {
                dataset.borderDash = []
            }

            if (props.customization?.trendColoring) {
                delete dataset.borderColor
                delete dataset.backgroundColor

                const addOpacity = (hex: string, alpha: number) => {
                    const r = parseInt(hex.slice(1, 3), 16)
                    const g = parseInt(hex.slice(3, 5), 16)
                    const b = parseInt(hex.slice(5, 7), 16)
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`
                }

                dataset.segment = {
                    borderColor: (ctx: any) => {
                        if (ctx.p0.parsed.y > ctx.p1.parsed.y) return '#ef4444'
                        return '#22c55e'
                    },
                    backgroundColor: (ctx: any) => {
                        if (!dataset.fill) return undefined
                        if (ctx.p0.parsed.y > ctx.p1.parsed.y) return addOpacity('#ef4444', 0.2)
                        return addOpacity('#22c55e', 0.2)
                    }
                }
            } else {
                delete dataset.segment
            }

            if (Array.isArray(dataset.data)) {
                dataset.data = dataset.data.map((v: any) => (typeof v === 'number' ? v : parseFloat(v)))
            }
        }

        if (props.type === 'bar' && data.datasets && data.datasets.length > 0) {
            const dataset = data.datasets[0]
            if (props.customization?.borderRadius) dataset.borderRadius = props.customization.borderRadius
            if (props.customization?.barThickness) dataset.barThickness = props.customization.barThickness
        }

        return data
    })

    const computedOptions = computed(() => {
        const options = JSON.parse(JSON.stringify(props.options || {}))

        options.onClick = (event: any, elements: any[]) => {
            if (elements.length > 0 && emit) {
                const chart = event.chart
                const firstElement = elements[0]
                const index = firstElement.index
                const label = chart.data.labels[index]
                const value = chart.data.datasets[firstElement.datasetIndex].data[index]
                const datasetLabel = chart.data.datasets[firstElement.datasetIndex].label
                emit('drill-down', { label, value, datasetLabel, index })
            }
        }

        if (!options.plugins) options.plugins = {}
        if (!options.plugins.legend) options.plugins.legend = {}
        options.plugins.legend.display = props.customization?.showLegend !== false

        if (!options.plugins.tooltip) options.plugins.tooltip = {}
        options.plugins.tooltip.enabled = props.customization?.showTooltips !== false

        if (props.customization?.notes) {
            if (!options.plugins.tooltip.callbacks) options.plugins.tooltip.callbacks = {}
            options.plugins.tooltip.callbacks.footer = (tooltipItems: any[]) => {
                const notes: string[] = []
                tooltipItems.forEach((item) => {
                    const index = item.dataIndex
                    const note = props.customization.notes?.[index]
                    if (note) notes.push(`Note: ${note}`)
                })
                return notes.join('\n')
            }
        }

        const fullLabels = options.plugins?.fullLabels
        if (fullLabels && Array.isArray(fullLabels)) {
            if (!options.plugins.tooltip.callbacks) options.plugins.tooltip.callbacks = {}
            options.plugins.tooltip.callbacks.title = (tooltipItems: any[]) => {
                if (tooltipItems.length === 0) return ''
                const index = tooltipItems[0].dataIndex
                return fullLabels[index] || tooltipItems[0].label
            }
            delete options.plugins.fullLabels
        }

        const hideAxes = !!props.customization?.hideAxes
        const isCartesian = !['pie', 'doughnut', 'radar', 'polarArea'].includes(props.type)

        if (isCartesian) {
            const showGridX = props.customization?.showGridX ?? true
            const showGridY = props.customization?.showGridY ?? true

            if (!options.scales) options.scales = {}
            if (!options.scales.x) options.scales.x = { display: !hideAxes, grid: { display: showGridX && !hideAxes } }
            if (!options.scales.y) options.scales.y = { display: !hideAxes, grid: { display: showGridY && !hideAxes } }

            // Stacking
            if (props.customization?.stacked) {
                options.scales.x.stacked = true
                options.scales.y.stacked = true
            }

            // Hide Ticks
            if (!options.scales.x.ticks) options.scales.x.ticks = {}
            if (!options.scales.y.ticks) options.scales.y.ticks = {}
            options.scales.x.ticks.display = hideAxes ? false : (options.scales.x.ticks.display ?? true)
            options.scales.y.ticks.display = hideAxes ? false : (options.scales.y.ticks.display ?? true)
        }

        return options
    })

    return {
        computedData,
        computedOptions
    }
}
