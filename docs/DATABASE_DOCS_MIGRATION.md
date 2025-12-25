# Documentation Database Migration

## Overview
This implementation moves documentation and changelogs from static files to the Neon PostgreSQL database, making them accessible to both web and desktop applications.

## Database Schema

### Tables Created:
1. **guides** - Documentation guides/tutorials
   - slug (unique identifier)
   - title
   - content (markdown)
   - category
   - order_index
   - published status

2. **releases** - Release versions
   - version (unique, e.g., "v0.8.0")
   - title
   - description
   - date
   - is_latest flag
   - published status

3. **release_sections** - Sections within a release (New Features, Improvements, Bug Fixes)
   - release_id (FK to releases)
   - category
   - order_index

4. **release_items** - Individual changes within a section
   - section_id (FK to release_sections)
   - title
   - description
   - details (text array)
   - order_index

## API Endpoints

All endpoints remain unchanged to maintain compatibility:

- `GET /api/docs` - List all guides and releases
- `GET /api/docs/guides/:slug` - Get specific guide content
- `GET /api/docs/releases/:version` - Get specific release with all sections

## Migration Steps

### 1. Run the Migration Script
Navigate to the backend directory and run:
```bash
cd apps/backend
NEON_DATABASE_URL="your_database_url" node scripts/migrate-docs.js
```

This script will:
- Create all necessary tables
- Read existing markdown guides from `docs/guides/`
- Read existing JSON changelogs from `apps/ui/public/changelogs/`
- Insert all content into the database

### 2. Verify Migration
Check that content was migrated successfully:
```sql
SELECT COUNT(*) FROM guides;
SELECT COUNT(*) FROM releases;
SELECT version, title FROM releases ORDER BY date DESC LIMIT 5;
```

## Adding New Documentation

### Adding a New Guide
```sql
INSERT INTO guides (slug, title, content, category, published)
VALUES ('new-guide', 'Guide Title', '# Markdown Content Here', 'tutorial', true);
```

### Adding a New Release
```javascript
// Example using the database
const release = await sql`
    INSERT INTO releases (version, title, description, date, is_latest)
    VALUES ('v0.9.0', 'Version 0.9.0', 'New features and improvements', '2025-01-01', true)
    RETURNING id
`

// Add sections
const section = await sql`
    INSERT INTO release_sections (release_id, category, order_index)
    VALUES (${release[0].id}, 'New Features', 0)
    RETURNING id
`

// Add items
await sql`
    INSERT INTO release_items (section_id, title, description, details, order_index)
    VALUES (
        ${section[0].id},
        'Feature Name',
        'Feature description',
        ARRAY['Detail 1', 'Detail 2'],
        0
    )
`
```

## Benefits

1. **Centralized Storage** - Single source of truth for all documentation
2. **Cross-Platform** - Both web and desktop apps read from same database
3. **Easy Updates** - Update docs without deploying new code
4. **Version Control** - Track when docs were created/updated
5. **Flexible Queries** - Can easily filter, search, or organize content
6. **Scalable** - Add new content types without file system changes

## File Structure

```
apps/backend/
├── migrations/
│   └── 001_docs_schema.sql          # Database schema
├── scripts/
│   └── migrate-docs.js               # Migration script
├── src/
│   ├── db/
│   │   └── neon.ts                   # Database connection
│   ├── services/
│   │   └── docsService.js            # Business logic
│   └── routes/
│       └── docs.js                   # API endpoints (updated)
```

## Notes

- The migration script preserves the existing API interface
- Frontend code requires no changes - it already uses `/api/docs` endpoints
- Old static files can be kept as backup or removed after successful migration
- The `is_latest` flag on releases table allows marking the most recent version
