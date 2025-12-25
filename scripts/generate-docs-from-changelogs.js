#!/usr/bin/env node

/**
 * Generate static docs index from existing changelog files
 * This doesn't require database access - it reads from changelogs/
 */

import { readdir } from 'fs/promises'
import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CHANGELOGS_DIR = join(__dirname, '../apps/ui/public/changelogs')
const DOCS_DIR = join(__dirname, '../apps/ui/public/docs')
const RELEASES_DIR = join(DOCS_DIR, 'releases')

async function generateDocsFromChangelogs() {
    try {
        console.log('📚 Generating docs from changelog files...\n')

        // Ensure docs directories exist
        await import('fs').then(fs => {
            if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true })
            if (!fs.existsSync(RELEASES_DIR)) fs.mkdirSync(RELEASES_DIR, { recursive: true })
        })

        // Read changelog files
        const files = await readdir(CHANGELOGS_DIR)
        const changelogFiles = files.filter(f => f.startsWith('v') && f.endsWith('.json'))

        console.log(`Found ${changelogFiles.length} changelog files`)

        // Copy/symlink changelog files to releases directory
        const versions = []
        for (const file of changelogFiles) {
            const version = file.replace('.json', '')
            versions.push(version)

            // Create symlink or copy
            const sourcePath = join(CHANGELOGS_DIR, file)
            const destPath = join(RELEASES_DIR, file)

            const fs = await import('fs')
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath)
            }
            fs.copyFileSync(sourcePath, destPath)
            console.log(`  ✓ Copied ${file}`)
        }

        // Sort versions
        versions.sort((a, b) => {
            const versionA = a.replace('v', '').split('.').map(Number)
            const versionB = b.replace('v', '').split('.').map(Number)
            for (let i = 0; i < Math.max(versionA.length, versionB.length); i++) {
                const valA = versionA[i] || 0
                const valB = versionB[i] || 0
                if (valA !== valB) return valB - valA
            }
            return 0
        })

        // Generate index
        const index = {
            guides: [], // Empty for now, can add later
            changelogs: versions
        }

        await writeFile(join(DOCS_DIR, 'index.json'), JSON.stringify(index, null, 2))

        console.log('\n' + '='.repeat(60))
        console.log('✅ Docs generation complete!')
        console.log('='.repeat(60))
        console.log(`📄 Index: 1 file`)
        console.log(`🚀 Releases: ${versions.length} files`)
        console.log(`📁 Output: ${DOCS_DIR}`)
        console.log('='.repeat(60))

    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

generateDocsFromChangelogs()
