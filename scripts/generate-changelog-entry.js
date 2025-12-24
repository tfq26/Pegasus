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
    Features: [],
    'Bug Fixes': [],
    Improvements: [],
    Other: []
}

commits.forEach(msg => {
    // Simple heuristics
    if (msg.match(/^feat(\(.*\))?:/i) || msg.match(/^feature/i)) {
        categories.Features.push(msg)
    } else if (msg.match(/^fix(\(.*\))?:/i) || msg.match(/^bug/i)) {
        categories['Bug Fixes'].push(msg)
    } else if (msg.match(/^refactor/i) || msg.match(/^perf/i) || msg.match(/^style/i) || msg.match(/^chore/i) || msg.match(/^improvement/i)) {
        categories.Improvements.push(msg)
    } else {
        categories.Other.push(msg)
    }
})

// Build JSON structure
const jsonOutput = {
    version,
    date,
    title,
    description: `Release v${version}`,
    categories: []
}

for (const [name, msgs] of Object.entries(categories)) {
    if (msgs.length > 0) {
        jsonOutput.categories.push({
            name,
            items: msgs.map(msg => ({
                title: msg,
                description: msg,
                type: name === 'Features' ? 'new' : name === 'Bug Fixes' ? 'fix' : 'improvement'
            }))
        })
    }
}

const outputPath = join(__dirname, `../apps/ui/public/changelogs/v${version}.json`)

await writeFile(outputPath, JSON.stringify(jsonOutput, null, 4))
console.log(`✅ Changelog generated at ${outputPath}`)
