import { Hono } from "hono";
import {
    getDocsIndex,
    getGuide,
    getRelease
} from '../services/docsService.js'

const docs = new Hono();

/**
 * GET /api/docs
 * Get list of all guides and releases
 */
docs.get("/", async (c) => {
    try {
        const index = await getDocsIndex()
        return c.json(index)
    } catch (error) {
        console.error('Error fetching docs index:', error)
        return c.json({
            error: 'Failed to fetch documentation index',
            message: error.message
        }, 500)
    }
});

/**
 * GET /api/docs/releases
 * Get list of all releases with summary info
 */
docs.get("/releases", async (c) => {
    try {
        const releases = await getReleases()
        return c.json(releases)
    } catch (error) {
        console.error('Error fetching releases list:', error)
        return c.json({
            error: 'Failed to fetch releases list',
            message: error.message
        }, 500)
    }
});

/**
 * GET /api/docs/guides/:slug
 * Get a specific guide by slug
 */
docs.get("/guides/:slug", async (c) => {
    try {
        const slug = c.req.param("slug")
        const guide = await getGuide(slug)
        return c.json({ slug, content: guide.content, ...guide })
    } catch (error) {
        console.error('Error fetching guide:', error)
        if (error.message === 'Guide not found') {
            return c.json({ error: 'Guide not found' }, 404)
        } else {
            return c.json({
                error: 'Failed to fetch guide',
                message: error.message
            }, 500)
        }
    }
});

/**
 * GET /api/docs/releases/:slug
 * Get a specific release by version (e.g., v0.8.0)
 */
docs.get("/releases/:slug", async (c) => {
    try {
        const slug = c.req.param("slug")
        const release = await getRelease(slug)
        return c.json({ slug, data: release })
    } catch (error) {
        console.error('Error fetching release:', error)
        if (error.message === 'Release not found') {
            return c.json({ error: 'Release not found' }, 404)
        } else {
            return c.json({
                error: 'Failed to fetch release',
                message: error.message
            }, 500)
        }
    }
});

export default docs;
