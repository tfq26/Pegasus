import { neon } from '@neondatabase/serverless'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATABASE_URL = process.env.NEON_DATABASE_URL
if (!DATABASE_URL) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
}

const sql = neon(DATABASE_URL)

// Paths to content
const GUIDES_DIR = path.resolve(__dirname, '../../../docs/guides')
const CHANGELOG_DIR = path.resolve(__dirname, '../../ui/public/changelogs')

async function createTables() {
    console.log('Creating tables...')

    // Create guides table
    await sql`
        CREATE TABLE IF NOT EXISTS guides (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(255) UNIQUE NOT NULL,
            title VARCHAR(500) NOT NULL,
            content TEXT NOT NULL,
            content_type VARCHAR(50) DEFAULT 'markdown',
            category VARCHAR(100),
            order_index INTEGER DEFAULT 0,
            published BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `

    // Ensure column exists for older tables
    await sql`ALTER TABLE guides ADD COLUMN IF NOT EXISTS content_type VARCHAR(50) DEFAULT 'markdown'`

    // Create releases table
    await sql`
        CREATE TABLE IF NOT EXISTS releases (
            id SERIAL PRIMARY KEY,
            version VARCHAR(50) UNIQUE NOT NULL,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            date DATE NOT NULL,
            is_latest BOOLEAN DEFAULT false,
            published BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `

    // Create release_sections table
    await sql`
        CREATE TABLE IF NOT EXISTS release_sections (
            id SERIAL PRIMARY KEY,
            release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
            category VARCHAR(100) NOT NULL,
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `

    // Create release_items table
    await sql`
        CREATE TABLE IF NOT EXISTS release_items (
            id SERIAL PRIMARY KEY,
            section_id INTEGER NOT NULL REFERENCES release_sections(id) ON DELETE CASCADE,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            details TEXT[],
            order_index INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides(slug)`
    await sql`CREATE INDEX IF NOT EXISTS idx_guides_published ON guides(published)`
    await sql`CREATE INDEX IF NOT EXISTS idx_releases_version ON releases(version)`
    await sql`CREATE INDEX IF NOT EXISTS idx_releases_is_latest ON releases(is_latest)`
    await sql`CREATE INDEX IF NOT EXISTS idx_releases_published ON releases(published)`
    await sql`CREATE INDEX IF NOT EXISTS idx_release_sections_release_id ON release_sections(release_id)`
    await sql`CREATE INDEX IF NOT EXISTS idx_release_items_section_id ON release_items(section_id)`

    console.log('  ✓ Tables created\n')
}

async function migrateGuides() {
    console.log('Syncing guides...')

    try {
        const files = await fs.readdir(GUIDES_DIR)
        const mdFiles = files.filter(f => f.endsWith('.md'))

        // Fetch existing guides to skip unchanged ones
        const existingGuides = await sql`SELECT slug, updated_at FROM guides`
        const guideMap = new Map(existingGuides.map(g => [g.slug, g.updated_at]))

        let migratedCount = 0
        let skippedCount = 0

        for (const file of mdFiles) {
            const slug = file.replace('.md', '')

            // Skip if exists and not forced
            if (guideMap.has(slug) && !process.argv.includes('--force')) {
                skippedCount++
                continue
            }

            const content = await fs.readFile(path.join(GUIDES_DIR, file), 'utf-8')

            // Extract title from first line (if it's a heading)
            const lines = content.split('\n')
            let title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            if (lines[0].startsWith('# ')) {
                title = lines[0].replace('# ', '').trim()
            }

            await sql`
                INSERT INTO guides (slug, title, content, content_type, published)
                VALUES (${slug}, ${title}, ${content}, 'markdown', true)
                ON CONFLICT (slug) 
                DO UPDATE SET 
                    title = EXCLUDED.title,
                    content = EXCLUDED.content,
                    content_type = EXCLUDED.content_type,
                    updated_at = CURRENT_TIMESTAMP
            `

            console.log(`  ✓ Syncing guide: ${slug}`)
            migratedCount++
        }

        console.log(`Summary: ${migratedCount} synced, ${skippedCount} skipped (up-to-date)`)
    } catch (error) {
        console.error('Error syncing guides:', error)
    }
}

async function migrateReleases() {
    console.log('\nMigrating releases...')

    try {
        const files = await fs.readdir(CHANGELOG_DIR)
        const jsonFiles = files.filter(f => f.endsWith('.json'))

        // Fetch existing versions from DB to skip unchanged ones
        const existingReleases = await sql`SELECT version, updated_at FROM releases`
        const releaseMap = new Map(existingReleases.map(r => [r.version, r.updated_at]))

        let migratedCount = 0
        let skippedCount = 0

        for (const file of jsonFiles) {
            const version = file.replace('.json', '')
            const content = await fs.readFile(path.join(CHANGELOG_DIR, file), 'utf-8')
            const data = JSON.parse(content)

            // Skip if exists and not forced (simple comparison or just skip)
            if (releaseMap.has(version) && !process.argv.includes('--force')) {
                skippedCount++
                continue
            }

            // If this is the latest release, unmark others first
            if (data.isLatest) {
                await sql`UPDATE releases SET is_latest = false`
            }

            // Insert or update release
            const [release] = await sql`
                INSERT INTO releases (version, title, description, date, is_latest, published)
                VALUES (
                    ${version},
                    ${data.title || `Release ${version}`},
                    ${data.description || ''},
                    ${data.date || new Date().toISOString().split('T')[0]},
                    ${data.isLatest || false},
                    true
                )
                ON CONFLICT (version)
                DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    date = EXCLUDED.date,
                    is_latest = EXCLUDED.is_latest,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            `

            // Delete existing sections for this release
            await sql`DELETE FROM release_sections WHERE release_id = ${release.id}`

            // Insert sections and items
            if (data.sections && Array.isArray(data.sections)) {
                for (let i = 0; i < data.sections.length; i++) {
                    const section = data.sections[i]

                    const [sectionRow] = await sql`
                        INSERT INTO release_sections (release_id, category, order_index)
                        VALUES (${release.id}, ${section.category}, ${i})
                        RETURNING id
                    `

                    if (section.items && Array.isArray(section.items)) {
                        for (let j = 0; j < section.items.length; j++) {
                            const item = section.items[j]

                            await sql`
                                INSERT INTO release_items (
                                    section_id, 
                                    title, 
                                    description, 
                                    details, 
                                    order_index
                                )
                                VALUES (
                                    ${sectionRow.id},
                                    ${item.title || ''},
                                    ${item.description || ''},
                                    ${item.details || []},
                                    ${j}
                                )
                            `
                        }
                    }
                }
            }

            console.log(`  ✓ Syncing release: ${version}`)
            migratedCount++
        }

        console.log(`Summary: ${migratedCount} synced, ${skippedCount} skipped (up-to-date)`)
    } catch (error) {
        console.error('Error syncing releases:', error)
    }
}

async function main() {
    console.log('Starting documentation migration to Neon database...\n')

    try {
        // Create tables
        await createTables()

        // Migrate content
        await migrateGuides()
        await migrateReleases()

        console.log('\n✅ Migration complete!')
    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }
}

main()
