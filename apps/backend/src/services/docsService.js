import { sql } from '../db/neon.js'

/**
 * Get all guides (list)
 */
export async function getGuides() {
    if (!sql) throw new Error('Database not configured')

    const guides = await sql`
        SELECT slug, title, category, order_index
        FROM guides
        WHERE published = true
        ORDER BY order_index ASC, created_at DESC
    `

    return guides.map(g => g.slug)
}

/**
 * Get a specific guide by slug
 */
export async function getGuide(slug) {
    if (!sql) throw new Error('Database not configured')

    const [guide] = await sql`
        SELECT slug, title, content, content_type, category, updated_at
        FROM guides
        WHERE slug = ${slug} AND published = true
    `

    if (!guide) {
        throw new Error('Guide not found')
    }

    return guide
}

/**
 * Get all releases (list)
 */
export async function getReleases() {
    if (!sql) throw new Error('Database not configured')

    const releases = await sql`
        SELECT version, title, date, is_latest
        FROM releases
        WHERE published = true
        ORDER BY date DESC
    `

    return releases.map(r => ({
        version: r.version,
        title: r.title,
        description: r.description,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : null,
        isLatest: r.is_latest
    }))
}

/**
 * Get a specific release with all sections and items
 */
export async function getRelease(version) {
    if (!sql) throw new Error('Database not configured')

    // Get release header
    const [release] = await sql`
        SELECT id, version, title, description, date, is_latest
        FROM releases
        WHERE version = ${version} AND published = true
    `

    if (!release) {
        throw new Error('Release not found')
    }

    // Get sections with items
    const sections = await sql`
        SELECT 
            rs.id,
            rs.category,
            rs.order_index,
            json_agg(
                json_build_object(
                    'title', ri.title,
                    'description', ri.description,
                    'details', ri.details
                ) ORDER BY ri.order_index
            ) as items
        FROM release_sections rs
        LEFT JOIN release_items ri ON ri.section_id = rs.id
        WHERE rs.release_id = ${release.id}
        GROUP BY rs.id, rs.category, rs.order_index
        ORDER BY rs.order_index
    `

    return {
        version: release.version,
        title: release.title,
        description: release.description,
        date: release.date ? new Date(release.date).toISOString().split('T')[0] : null,
        isLatest: release.is_latest,
        sections: sections.map(s => ({
            category: s.category,
            items: s.items.filter(item => item.title !== null) // Remove null items from LEFT JOIN
        }))
    }
}

/**
 * Get docs index (both guides and releases)
 */
export async function getDocsIndex() {
    const guides = await getGuides()
    const releases = await getReleases()

    return {
        guides,
        changelogs: releases.map(r => r.version)
    }
}
