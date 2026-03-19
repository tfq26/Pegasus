import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PromptRegistry
 * 
 * Central loader for AI prompts stored in the library folder.
 * This allows prompts to be managed as separate markdown/txt files.
 */
class PromptRegistry {
    constructor() {
        this.promptsDir = path.join(__dirname, 'prompts', 'library');
        this.cache = new Map();
    }

    /**
     * Loads a prompt from the library and performs simple variable replacement.
     * 
     * @param {string} promptName - Filename without extension (e.g., 'healing')
     * @param {Object} variables - Key-value pairs for {{variable}} replacement
     * @returns {string} The processed prompt text
     */
    get(promptName, variables = {}) {
        let content = this.cache.get(promptName);

        if (!content) {
            const filePath = path.join(this.promptsDir, `${promptName}.md`);
            try {
                content = fs.readFileSync(filePath, 'utf8');
                this.cache.set(promptName, content);
            } catch (err) {
                console.error(`[PromptRegistry] Failed to load prompt "${promptName}":`, err.message);
                // Fallback to searching for .txt or .prompt if .md is missing
                return null;
            }
        }

        // Simple template replacement: {{variable}}
        let processed = content;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            processed = processed.replace(regex, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
        }

        return processed;
    }

    /**
     * Clears the prompt cache (useful during development)
     */
    clearCache() {
        this.cache.clear();
    }
}

export const promptRegistry = new PromptRegistry();
