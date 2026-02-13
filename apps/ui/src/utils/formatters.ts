/**
 * Utility functions for formatting data in the UI
 */

/**
 * Format a number with commas and consistent decimals
 */
export const formatNumber = (val: number, decimals: number = 0): string => {
    if (val === undefined || val === null || isNaN(val)) return '—'
    return val.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    })
}

/**
 * Format a date string into a readable format (e.g., "Jan 12, 26")
 */
export const formatDate = (dateStr: string, options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: '2-digit'
}): string => {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-US', options)
}

/**
 * Format a timestamp into a readable time (e.g., "12:30 PM")
 */
export const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return timestamp
    return date.toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    })
}

/**
 * Format a temperature value
 */
export const formatTemp = (temp: number): string => {
    if (temp === undefined || temp === null) return '—'
    return `${Math.round(temp)}°`
}

/**
 * Convert 24-hour time to 12-hour or vice versa for chart labels
 */
export const toggleTimeFormat = (label: string, use24h: boolean): string => {
    if (typeof label !== 'string') return label

    // Try parsing 24h time "HH:MM"
    const match24 = label.match(/^(\d{1,2}):(\d{2})$/)
    if (match24 && match24[1] && match24[2]) {
        if (use24h) return label
        let h = parseInt(match24[1])
        const m = match24[2]
        const ampm = h >= 12 ? 'PM' : 'AM'
        h = h % 12
        h = h ? h : 12
        return `${h}:${m} ${ampm}`
    }

    // Try parsing 12h time "HH:MM AM/PM"
    const match12 = label.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i)
    if (match12 && match12[1] && match12[2] && match12[3]) {
        if (!use24h) return label
        let h = parseInt(match12[1])
        const m = match12[2]
        const ampm = match12[3].toUpperCase()
        if (ampm === 'PM' && h < 12) h += 12
        if (ampm === 'AM' && h === 12) h = 0
        return `${h.toString().padStart(2, '0')}:${m}`
    }

    return label
}

/**
 * Clean up common time period markers that break Date constructor
 * e.g. "2026-02-05 12:00-23:59" -> "2026-02-05"
 */
export const cleanDateString = (str: string): string => {
    if (typeof str !== 'string') return str
    const parts = str.split(' ')
    return parts[0] || ''
}
