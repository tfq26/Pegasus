/**
 * Generate Static Docs JSON Files
 * 
 * This script exports documentation from the database to static JSON files
 * that can be deployed with the frontend for standalone deployment.
 * 
 * Output structure:
 * - ui/public/_docs/index.json - List of all guides and releases
 * - ui/public/_docs/guides/{slug}.json - Individual guide content
 * - ui/public/_docs/releases/{version}.json - Individual release content
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDocsIndex, getGuide, getRelease, getGuides, getReleases } from '../src/services/docsService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables manually
const envPath = path.join(__dirname, '../.env')
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim()
            process.env[key.trim()] = value
        }
    })
}

// Output directory in the UI public folder
const DOCS_OUTPUT_DIR = path.join(__dirname, '../../ui/public/_docs')
const GUIDES_DIR = path.join(DOCS_OUTPUT_DIR, 'guides')
const RELEASES_DIR = path.join(DOCS_OUTPUT_DIR, 'releases')

/**
 * Ensure directories exist
 */
function ensureDirectories() {
    for (const dir of [DOCS_OUTPUT_DIR, GUIDES_DIR, RELEASES_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    }
}

/**
 * Write JSON file
 */
function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    console.log(`✓ Generated ${path.relative(process.cwd(), filePath)}`)
}

/**
 * Main generation function
 */
async function generateStaticDocs() {
    console.log('📚 Generating static documentation files...\n')

    try {
        ensureDirectories()

        // 1. Generate index
        console.log('1️⃣  Generating index...')
        const index = await getDocsIndex()
        writeJSON(path.join(DOCS_OUTPUT_DIR, 'index.json'), index)

        // 2. Generate guides
        console.log('\n2️⃣  Generating guides...')
        const guideSlugs = await getGuides()
        let guidesGenerated = 0

        for (const slug of guideSlugs) {
            try {
                const guide = await getGuide(slug)
                writeJSON(path.join(GUIDES_DIR, `${slug}.json`), guide)
                guidesGenerated++
            } catch (error) {
                console.error(`  ✗ Failed to generate guide "${slug}":`, error.message)
            }
        }

        // 3. Generate releases
        console.log('\n3️⃣  Generating releases...')
        const releases = await getReleases()
        let releasesGenerated = 0

        for (const release of releases) {
            try {
                const releaseData = await getRelease(release.version)
                writeJSON(path.join(RELEASES_DIR, `${release.version}.json`), releaseData)
                releasesGenerated++
            } catch (error) {
                console.error(`  ✗ Failed to generate release "${release.version}":`, error.message)
            }
        }

        // 4. Summary
        console.log('\n' + '='.repeat(60))
        console.log('✅ Static docs generation complete!')
        console.log('='.repeat(60))
        console.log(`📄 Index: 1 file`)
        console.log(`📖 Guides: ${guidesGenerated} files`)
        console.log(`🚀 Releases: ${releasesGenerated} files`)
        console.log(`📁 Output: ${DOCS_OUTPUT_DIR}`)
        console.log('='.repeat(60))

    } catch (error) {
        console.error('\n❌ Error generating static docs:', error)
        process.exit(1)
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    generateStaticDocs()
}

export { generateStaticDocs }
