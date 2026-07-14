import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';

// Setup readline interface for interactive setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Colors for terminal formatting
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

async function main() {
    console.clear();
    console.log(`${colors.bright}${colors.cyan}====================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}  ⚡ Pegasus Cloudflare Integration & Provisioning ⚡${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}====================================================${colors.reset}\n`);

    console.log("This assistant will guide you step-by-step to connect your local");
    console.log("Pegasus instance to your Cloudflare account for database (D1) and");
    console.log("object storage (R2) support.\n");

    // 1. Verify wrangler presence
    console.log(`${colors.bright}[1/5] Verifying Cloudflare Wrangler CLI...${colors.reset}`);
    let hasWrangler = false;
    try {
        execSync('npx wrangler --version', { stdio: 'ignore' });
        hasWrangler = true;
        console.log(`${colors.green}✅ Wrangler CLI is available via npx.${colors.reset}\n`);
    } catch (e) {
        console.log(`${colors.yellow}⚠️  Wrangler CLI is not found or failed to initialize.${colors.reset}`);
        console.log("Please install it globally using 'npm install -g wrangler' or make sure npm is accessible.\n");
        process.exit(1);
    }

    // 2. Guide login
    console.log(`${colors.bright}[2/5] Checking Cloudflare Authentication...${colors.reset}`);
    console.log("We will trigger a browser window to log you into your Cloudflare account.");
    const doLogin = await question("Would you like to trigger 'npx wrangler login' now? (y/n): ");
    
    if (doLogin.toLowerCase() === 'y' || doLogin.toLowerCase() === 'yes') {
        console.log(`\n${colors.yellow}👉 Please complete the login flow in your web browser...${colors.reset}`);
        try {
            execSync('npx wrangler login', { stdio: 'inherit' });
            console.log(`\n${colors.green}✅ Authentication complete!${colors.reset}\n`);
        } catch (e) {
            console.log(`\n${colors.red}❌ Wrangler login failed or was cancelled.${colors.reset}`);
            console.log("You can manually run 'npx wrangler login' later. Continuing setup...\n");
        }
    } else {
        console.log("Skipping active login. (Assuming already logged in or connecting credentials manually).\n");
    }

    // 3. Provision D1 Database
    console.log(`${colors.bright}[3/5] Provisioning Cloudflare D1 Database...${colors.reset}`);
    const createD1 = await question("Would you like to create a new D1 SQLite Database 'pegasus-db' now? (y/n): ");
    let d1ConfigStr = "";
    
    if (createD1.toLowerCase() === 'y' || createD1.toLowerCase() === 'yes') {
        console.log(`\n${colors.yellow}🔨 Creating D1 database in your account...${colors.reset}`);
        try {
            const output = execSync('npx wrangler d1 create pegasus-db', { encoding: 'utf8' });
            console.log(output);
            console.log(`${colors.green}✅ Cloudflare D1 Database created successfully!${colors.reset}\n`);

            // Extract database ID if possible
            const idMatch = output.match(/database_id\s*=\s*"([^"]+)"/) || output.match(/database_id\s*:\s*([^\s]+)/);
            if (idMatch && idMatch[1]) {
                const dbId = idMatch[1];
                d1ConfigStr = dbId;
                console.log(`${colors.cyan}Database ID detected: ${dbId}${colors.reset}\n`);
            }
        } catch (e) {
            console.log(`\n${colors.red}❌ Failed to automatically create D1 database.${colors.reset}`);
            console.log("You might already have a database named 'pegasus-db' or need to log in first.");
            console.log("You can create one manually using: npx wrangler d1 create pegasus-db\n");
        }
    } else {
        const connectExisting = await question("Would you like to connect to an EXISTING D1 Database instead? (y/n): ");
        if (connectExisting.toLowerCase() === 'y' || connectExisting.toLowerCase() === 'yes') {
            const dbId = await question("Enter your existing D1 Database ID (UUID): ");
            if (dbId) {
                d1ConfigStr = dbId.trim();
                console.log(`${colors.green}✅ Associated existing database ID: ${d1ConfigStr}${colors.reset}\n`);
            }
        } else {
            console.log("Skipping D1 provisioning.\n");
        }
    }

    // 4. Provision R2 Bucket
    console.log(`${colors.bright}[4/5] Provisioning Cloudflare R2 Bucket...${colors.reset}`);
    const createR2 = await question("Would you like to create a new R2 Object Storage Bucket 'pegasus-storage' now? (y/n): ");
    let r2BucketName = "pegasus-storage";
    
    if (createR2.toLowerCase() === 'y' || createR2.toLowerCase() === 'yes') {
        console.log(`\n${colors.yellow}🔨 Creating R2 Bucket 'pegasus-storage' in your account...${colors.reset}`);
        try {
            execSync('npx wrangler r2 bucket create pegasus-storage', { stdio: 'inherit' });
            console.log(`\n${colors.green}✅ R2 Bucket created successfully!${colors.reset}\n`);
        } catch (e) {
            console.log(`\n${colors.red}❌ Failed to create R2 Bucket.${colors.reset}`);
            console.log("You may already have a bucket named 'pegasus-storage' or need to enable R2 billing in your Cloudflare dashboard.");
            console.log("You can create one manually using: npx wrangler r2 bucket create pegasus-storage\n");
        }
    } else {
        const useExistingR2 = await question("Would you like to connect to an EXISTING R2 Bucket? (y/n): ");
        if (useExistingR2.toLowerCase() === 'y' || useExistingR2.toLowerCase() === 'yes') {
            const name = await question("Enter your existing R2 Bucket name (e.g. pegasus-storage): ");
            if (name) {
                r2BucketName = name.trim();
                console.log(`${colors.green}✅ Connected to existing R2 Bucket: ${r2BucketName}${colors.reset}\n`);
            }
        } else {
            console.log("Skipping R2 provisioning.\n");
        }
    }

    // 5. Gather Credentials for Local .env Config
    console.log(`${colors.bright}[5/5] Configuring Local Cloudflare R2 Credentials...${colors.reset}`);
    console.log("To allow your local Pegasus backend to read/write directly to your Cloudflare R2 bucket,");
    console.log("you need to generate an S3-compatible API Token.");
    console.log(`\n${colors.bright}Steps to get R2 Credentials:${colors.reset}`);
    console.log(" 1. Open Cloudflare Dashboard: https://dash.cloudflare.com");
    console.log(" 2. Navigate to 'R2' in the sidebar.");
    console.log(" 3. Click 'Manage R2 API Tokens' on the right side.");
    console.log(" 4. Click 'Create API Token'.");
    console.log(" 5. Choose 'Edit' permissions (Read/Write) and click 'Create Token'.");
    console.log(" 6. Copy your Access Key ID, Secret Access Key, and Account ID.\n");

    const r2KeyId = await question("Enter R2 Access Key ID (or press Enter to skip): ");
    const r2Secret = await question("Enter R2 Secret Access Key (or press Enter to skip): ");
    const r2AccountId = await question("Enter R2 Account ID (or press Enter to skip): ");

    // Generate random secrets if none exist in target file
    const newJwtSecret = crypto.randomBytes(32).toString('hex');
    const newBetterAuthSecret = crypto.randomBytes(32).toString('hex');

    // Resolve apps/.env path
    const envPath = path.resolve(process.cwd(), 'apps/.env');

    let envContent = `# ============================================
# PEGASUS CLOUDFLARE CONFIGURATION
# ============================================
DATABASE_URL=file:pegasus_local.db
R2_ACCESS_KEY_ID=${r2KeyId || ''}
R2_SECRET_ACCESS_KEY=${r2Secret || ''}
R2_ACCOUNT_ID=${r2AccountId || ''}
R2_BUCKET_NAME=${r2BucketName}

# ============================================
# PEGASUS SECURE CRYPTO TOKENS
# ============================================
JWT_SECRET=${newJwtSecret}
BETTER_AUTH_SECRET=${newBetterAuthSecret}

# Optional external keys
GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}
`;

    // Write .env
    fs.writeFileSync(envPath, envContent);
    console.log(`\n${colors.green}✅ Successfully created apps/.env configuration at:${colors.reset}`);
    console.log(`   ${colors.bright}${envPath}${colors.reset}\n`);

    // Write wrangler.toml configuration for optional backend worker deployment
    const wranglerTomlPath = path.resolve(process.cwd(), 'apps/backend/wrangler.toml');
    const wranglerContent = `name = "pegasus-backend"
main = "index.js"
compatibility_date = "2024-03-01"

[[d1_databases]]
binding = "DB"
database_name = "pegasus-db"
database_id = "${d1ConfigStr || 'YOUR_D1_DATABASE_ID'}"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "${r2BucketName}"
`;
    fs.writeFileSync(wranglerTomlPath, wranglerContent);
    console.log(`${colors.green}✅ Successfully created wrangler.toml at:${colors.reset}`);
    console.log(`   ${colors.bright}${wranglerTomlPath}${colors.reset}\n`);

    console.log(`${colors.bright}${colors.green}====================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.green}🎉 Cloudflare Setup & Connection Complete! 🎉${colors.reset}`);
    console.log(`${colors.bright}${colors.green}====================================================${colors.reset}\n`);
    console.log("Your local Pegasus server is now fully configured to use your");
    console.log("Cloudflare account. You can boot the backend by running:\n");
    console.log(`   ${colors.bright}bun run-apps.js${colors.reset}\n`);

    rl.close();
}

main().catch(console.error);
