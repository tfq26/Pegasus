#!/usr/bin/env node

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CHANGELOG_DIR = path.resolve(__dirname, '../../ui/public/changelogs')

async function fixChangelogs() {
    const files = await fs.readdir(CHANGELOG_DIR)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    let fixedCount = 0

    for (const file of jsonFiles) {
        const filePath = path.join(CHANGELOG_DIR, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const data = JSON.parse(content)

        let needsFix = false

        if (data.sections && Array.isArray(data.sections)) {
            for (const section of data.sections) {
                // If section has 'title' but no 'category', rename it
                if (section.title && !section.category) {
                    section.category = section.title
                    delete section.title
                    needsFix = true
                }
            }
        }

        if (needsFix) {
            await fs.writeFile(filePath, JSON.stringify(data, null, 4) + '\n', 'utf-8')
            console.log(`✓ Fixed ${file}`)
            fixedCount++
        }
    }

    console.log(`\n✅ Fixed ${fixedCount} files`)
}

fixChangelogs().catch(console.error)
