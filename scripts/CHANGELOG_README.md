# Changelog Management

This directory contains the automated changelog management system for Pegasus.

## Directory Structure

```
scripts/
  └── generate-releases-index.js  # Auto-generates releases.json
apps/ui/public/
  ├── releases.json               # Auto-generated index (DO NOT EDIT MANUALLY)
  └── changelogs/
      ├── v0.5.2.json
      ├── v0.5.1.json
      ├── v0.5.0.json
      └── ...
```

## Creating a New Changelog

### 1. Create the Changelog File

Create a new file in `apps/ui/public/changelogs/` named `vX.Y.Z.json` (e.g., `v0.5.3.json`):

```json
{
  "version": "0.5.3",
  "releaseDate": "2025-12-19",
  "title": "Your Release Title",
  "description": "Brief description of the release",
  "highlights": [
    "Key feature 1",
    "Key feature 2",
    "Key feature 3"
  ],
  "sections": [
    {
      "title": "✨ Enhancements",
      "items": [
        {
          "title": "Feature Name",
          "description": "What it does",
          "details": [
            "Detail 1",
            "Detail 2"
          ]
        }
      ]
    },
    {
      "title": "🐛 Bug Fixes",
      "items": [
        {
          "title": "Bug Fix Title",
          "description": "What was fixed",
          "technical": "Technical details (optional)"
        }
      ]
    }
  ],
  "notes": [
    "Important note 1",
    "Important note 2"
  ]
}
```

### 2. Generate the Index

**Option A: Manual (for local development)**
```bash
npm run changelog:generate
```

**Option B: Automatic (on deployment)**

The index is **automatically generated** during build! 🎉

When you push to Git and Vercel builds your app, the `prebuild` script runs automatically:
```json
"prebuild": "node ../../scripts/generate-releases-index.js"
```

This means:
- ✅ Push your changelog file to Git
- ✅ Vercel automatically generates `releases.json` during build
- ✅ No manual intervention needed!

### 3. Verify

The Support page will automatically show the new changelog!

## Important Notes

⚠️ **DO NOT manually edit `releases.json`** - it's auto-generated!

✅ **Always run `npm run changelog:generate`** after creating a new changelog file

🎯 The script automatically:
- Detects all changelog files
- Sorts by semantic version
- Marks the latest release
- Generates the index

## Changelog Template

See `v0.5.2.json` for a comprehensive example with all available fields.

### Required Fields
- `version` - Semantic version (e.g., "0.5.3")
- `releaseDate` - ISO date or formatted string
- `title` - Release title
- `description` - Brief description

### Optional Fields
- `highlights` - Array of key features
- `sections` - Detailed changelog sections
- `notes` - Important notes
- `breaking` - Breaking changes
- `deprecations` - Deprecated features
- `contributors` - List of contributors

## Automation

The `generate-releases-index.js` script:
1. Scans `apps/ui/public/changelogs/` for `v*.json` files
2. Parses each changelog
3. Sorts by version (descending)
4. Marks the highest version as latest
5. Writes to `apps/ui/public/releases.json`

No manual intervention required! 🎉
