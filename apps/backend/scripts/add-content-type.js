import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.NEON_DATABASE_URL
if (!DATABASE_URL) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
}

const sql = neon(DATABASE_URL)

async function addContentTypeColumn() {
    try {
        console.log('Adding content_type column to guides table...')

        await sql`
            ALTER TABLE guides 
            ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'markdown'
        `

        console.log('✓ Column added successfully')
    } catch (error) {
        console.error('Error:', error.message)
        process.exit(1)
    }
}

addContentTypeColumn()
