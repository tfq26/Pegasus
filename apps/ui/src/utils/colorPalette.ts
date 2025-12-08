// HSL Color Types
interface HSL {
    h: number
    s: number
    l: number
}

// Convert Hex to HSL
export function hexToHSL(hex: string): HSL {
    // Remove # and handle short hex
    hex = hex.replace('#', '')
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('')
    }

    const r = parseInt(hex.substring(0, 2), 16) / 255
    const g = parseInt(hex.substring(2, 4), 16) / 255
    const b = parseInt(hex.substring(4, 6), 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    let h = 0
    let s = 0
    let l = (max + min) / 2

    if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

        switch (max) {
            case r:
                h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
                break
            case g:
                h = ((b - r) / delta + 2) / 6
                break
            case b:
                h = ((r - g) / delta + 4) / 6
                break
        }
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    }
}

// Convert HSL to Hex
export function hslToHex(hsl: HSL): string {
    const h = hsl.h / 360
    const s = hsl.s / 100
    const l = hsl.l / 100

    let r, g, b

    if (s === 0) {
        r = g = b = l
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1
            if (t > 1) t -= 1
            if (t < 1 / 6) return p + (q - p) * 6 * t
            if (t < 1 / 2) return q
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
            return p
        }

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q

        r = hue2rgb(p, q, h + 1 / 3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1 / 3)
    }

    const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Generate Monochromatic Palette (Same Hue, Vary Lightness)
export function generateMonochromatic(base: string, count: number): string[] {
    const hsl = hexToHSL(base)
    return Array.from({ length: count }, (_, i) => {
        // Avoid extreme white/black
        // Map i from 0..count-1 to lightness range 30%..85%
        const minL = 30
        const maxL = 85
        const step = (maxL - minL) / (count - 1 || 1)

        // We want the base color to be present if possible, or center the range around it?
        // Let's do a simple spread for now: Dark -> Light
        const lightness = minL + (i * step)

        return hslToHex({ h: hsl.h, s: hsl.s, l: lightness })
    })
}

// Generate Tonal Palette (Same Hue, Vary Saturation + Lightness)
export function generateTonal(base: string, count: number): string[] {
    const hsl = hexToHSL(base)
    return Array.from({ length: count }, (_, i) => {
        // Vary saturation from 30% to 90%
        // Vary lightness from 40% to 80%
        const sStep = (90 - 30) / (count - 1 || 1)
        const lStep = (80 - 40) / (count - 1 || 1)

        const saturation = 30 + (i * sStep)
        const lightness = 40 + (i * lStep)

        return hslToHex({ h: hsl.h, s: saturation, l: lightness })
    })
}

// Generate Analogous Palette (Adjacent Hues)
export function generateAnalogous(base: string, count: number): string[] {
    const hsl = hexToHSL(base)
    const spread = 40 // Total degree spread
    const startHue = hsl.h - (spread / 2)

    return Array.from({ length: count }, (_, i) => {
        const hueOffset = (i * spread / (count - 1 || 1))
        const newHue = (startHue + hueOffset + 360) % 360
        return hslToHex({ h: newHue, s: hsl.s, l: hsl.l })
    })
}

// Quick Themes
export const COLOR_THEMES = [
    { name: 'Professional', colors: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'] },
    { name: 'Vibrant', colors: ['#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4'] },
    { name: 'Monochrome', colors: ['#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af'] },
    { name: 'Financial', colors: ['#10b981', '#059669', '#ef4444', '#dc2626', '#3b82f6'] },
    { name: 'Sunset', colors: ['#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74'] },
    { name: 'Forest', colors: ['#14532d', '#166534', '#15803d', '#22c55e', '#4ade80'] }
]
