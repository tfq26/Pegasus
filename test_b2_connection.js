
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper to load env from a specific location
function loadEnv(filePath) {
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...value] = trimmed.split('=');
                if (key && value.length > 0) {
                    process.env[key.trim()] = value.join('=').trim();
                }
            }
        });
    }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendEnv = path.join(__dirname, 'apps', 'backend', '.env');
loadEnv(backendEnv);

// Now import the rest
import { StorageManager } from './apps/backend/src/services/storage/StorageManager.js';

async function testB2Connection() {
    console.log("🧪 Testing Backblaze B2 connection...");

    try {
        // Force 'system' provider which we just updated to check B2 env vars
        const provider = await StorageManager.getProvider('system', 'system');

        const testFileName = `test-upload-${Date.now()}.txt`;
        const testContent = Buffer.from("Hello from Pegasus! B2 connection is verified.");

        console.log(`📤 Uploading to bucket: ${provider.bucket} at endpoint: ${provider.config.endpoint}...`);

        const result = await provider.upload(testFileName, testContent, 'text/plain');

        console.log("✅ Upload successful!");
        console.log("🔗 URL:", result.url);
        console.log("📦 Bucket:", result.bucket);
        console.log("🔑 Key:", result.key);

    } catch (error) {
        console.error("❌ B2 Test Failed:");
        console.error(error);
        process.exit(1);
    }
}

testB2Connection();
