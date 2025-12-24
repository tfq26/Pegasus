import { Hono } from "hono";
import { promises as fs } from "fs";
import path from "path";

const docs = new Hono();

// Directory paths
const GUIDES_DIR = path.resolve(process.cwd(), "../../docs/guides");
const CHANGELOG_DIR = path.resolve(process.cwd(), "../ui/public/changelogs");

// Utility to read folder content
async function listFiles(dir) {
    try {
        const files = await fs.readdir(dir);
        return files.filter(f => f.endsWith(".md") || f.endsWith(".json"));
    } catch (e) {
        console.error(`Error reading directory ${dir}:`, e);
        return [];
    }
}

// 1. List Documentation & Releases
docs.get("/", async (c) => {
    const guides = await listFiles(GUIDES_DIR);
    const changelogs = await listFiles(CHANGELOG_DIR);

    return c.json({
        guides: guides.map(f => f.replace(".md", "")),
        changelogs: changelogs.map(f => f.replace(".json", ""))
    });
});

// 2. Fetch specific doc
docs.get("/guides/:slug", async (c) => {
    const slug = c.req.param("slug");
    const filePath = path.join(GUIDES_DIR, `${slug}.md`);

    try {
        const content = await fs.readFile(filePath, "utf-8");
        return c.json({ slug, content });
    } catch (e) {
        return c.json({ error: "Document not found" }, 404);
    }
});

// 3. Fetch specific release
docs.get("/releases/:slug", async (c) => {
    const slug = c.req.param("slug");
    const filePath = path.join(CHANGELOG_DIR, `${slug}.json`);

    try {
        const content = await fs.readFile(filePath, "utf-8");
        return c.json({ slug, data: JSON.parse(content) });
    } catch (e) {
        return c.json({ error: "Release not found" }, 404);
    }
});

export default docs;
