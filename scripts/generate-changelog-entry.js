#!/usr/bin/env node

import { execSync } from 'child_process'
import { writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse arguments
const args = process.argv.slice(2)
const versionArg = args.find(a => a.startsWith('--version='))?.split('=')[1]
const titleArg = args.find(a => a.startsWith('--title='))?.split('=')[1]

if (!versionArg) {
    console.error('Missing --version argument')
    process.exit(1)
}

const version = versionArg.replace(/^v/, '') // Remove 'v' prefix if present
const title = titleArg || `Release v${version}`
const date = new Date().toISOString().split('T')[0]

console.log(`Generating changelog for v${version}...`)

// Get last tag
let lastTag
try {
    lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
} catch (e) {
    console.log('No previous tags found. Using initial commit.')
}

// Get commits
const logCommand = lastTag
    ? `git log ${lastTag}..HEAD --pretty=format:"%s"`
    : `git log --pretty=format:"%s"`

let commits = []
try {
    commits = execSync(logCommand, { encoding: 'utf-8' }).split('\n').filter(Boolean)
} catch (e) {
    console.warn('Failed to get commits:', e)
}

// Categorize commits
const categories = {
    'New Features': [],
    'Improvements': [],
    'Bug Fixes': []
}

commits.forEach(msg => {
    // Filter out internal/junk commits
    if (msg.match(/^(chore|ci|debug|refactor|test|WIP|docs|style|debug):/i)) return
    if (msg.toLowerCase().includes('checkpoint')) return
    if (msg.toLowerCase().includes('release v')) return
    if (msg.toLowerCase().includes('fix to deployments')) return

    // Heuristics for categories
    const cleanMsg = msg.replace(/^(feat|fix|perf|improvement)(\(.*\))?:\s*/i, '').trim()
    const capitalizedMsg = cleanMsg.charAt(0).toUpperCase() + cleanMsg.slice(1)

    if (msg.match(/^feat(\(.*\))?:/i)) {
        categories['New Features'].push(capitalizedMsg)
    } else if (msg.match(/^fix(\(.*\))?:/i)) {
        categories['Bug Fixes'].push(capitalizedMsg)
    } else if (msg.match(/^(perf|improvement)(\(.*\))?:\s*/i)) {
        categories['Improvements'].push(capitalizedMsg)
    }
    // "Other" is ignored by design for customer-facing docs
})

// Build JSON structure
const jsonOutput = {
    version,
    releaseDate: date,
    date,
    title,
    description: `Detailed changes and improvements for version ${version}.`,
    highlights: [],
    sections: []
}

for (const [name, msgs] of Object.entries(categories)) {
    if (msgs.length > 0) {
        jsonOutput.sections.push({
            category: name,
            items: msgs.map(msg => ({
                title: msg,
                description: msg,
                details: [] // Details usually require manual curation
            }))
        })
    }
}

const outputPath = join(__dirname, `../apps/ui/public/changelogs/v${version}.json`)

await writeFile(outputPath, JSON.stringify(jsonOutput, null, 4))
console.log(`✅ Changelog generated at ${outputPath}`)
