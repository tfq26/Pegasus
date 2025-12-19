#!/usr/bin/env node

/**
 * Automatically generates releases.json by scanning the changelogs directory
 * Run this script after creating a new changelog file
 */

import { readdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CHANGELOGS_DIR = join(__dirname, '../apps/ui/public/changelogs')
const OUTPUT_FILE = join(__dirname, '../apps/ui/public/releases.json')

async function generateReleasesIndex() {
    try {
        console.log('📦 Scanning changelogs directory...')

        // Read all changelog files
        const files = await readdir(CHANGELOGS_DIR)
        const changelogFiles = files.filter(f => f.startsWith('v') && f.endsWith('.json'))

        console.log(`Found ${changelogFiles.length} changelog files`)

        // Load and parse each changelog
        const releases = []
        for (const file of changelogFiles) {
            try {
                const content = await readFile(join(CHANGELOGS_DIR, file), 'utf-8')
                const changelog = JSON.parse(content)

                releases.push({
                    version: changelog.version,
                    releaseDate: changelog.releaseDate,
                    title: changelog.title,
                    description: changelog.description,
                    changelogFile: file,
                    isLatest: false // Will be set later
                })

                console.log(`  ✓ Loaded ${file} (${changelog.version})`)
            } catch (error) {
                console.error(`  ✗ Failed to load ${file}:`, error.message)
            }
        }

        // Sort by version (descending)
        releases.sort((a, b) => {
            const versionA = a.version.split('.').map(Number)
            const versionB = b.version.split('.').map(Number)

            for (let i = 0; i < 3; i++) {
                if (versionA[i] !== versionB[i]) {
                    return versionB[i] - versionA[i]
                }
            }
            return 0
        })

        // Mark the latest release
        if (releases.length > 0) {
            releases[0].isLatest = true
            console.log(`\n🎯 Latest version: ${releases[0].version}`)
        }

        // Generate the output
        const output = {
            releases
        }

        // Write to file
        await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 4))

        console.log(`\n✅ Generated releases.json with ${releases.length} releases`)
        console.log(`📄 Output: ${OUTPUT_FILE}`)

    } catch (error) {
        console.error('❌ Error generating releases index:', error)
        process.exit(1)
    }
}

generateReleasesIndex()
