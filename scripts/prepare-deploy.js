
const fs = require('fs');
const { execSync } = require('child_process');

console.log("🚀 Pegasus - Vercel Deployment Preparation");
console.log("==========================================");
console.log("");

// Colors
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m"
};

try {
    // 1. Install
    console.log("📋 Step 1: Installing dependencies...");
    execSync('bun install', { stdio: 'inherit' });
    console.log(`${colors.green}✅ Dependencies installed${colors.reset}\n`);

    // 2. Build
    console.log("🔨 Step 2: Building the application...");
    execSync('bun run build', { stdio: 'inherit' });
    console.log(`${colors.green}✅ All workspaces built successfully${colors.reset}\n`);

    // 3. Lint
    console.log("🧹 Step 3: Running lint checks...");
    try {
        execSync('bun run lint', { stdio: 'inherit' });
        console.log(`${colors.green}✅ Lint check complete${colors.reset}\n`);
    } catch (e) {
        console.log(`${colors.yellow}⚠️  Lint warnings found (non-blocking)${colors.reset}\n`);
    }

    // 4. Check files
    console.log("📁 Checking required files...");
    const requiredFiles = [
        "apps/backend/index.js",
        "apps/ui/dist/index.html",
        "apps/backend/package.json",
        "apps/ui/package.json"
    ];

    requiredFiles.forEach(file => {
        if (fs.existsSync(file)) {
            console.log(`${colors.green}✅ ${file}${colors.reset}`);
        } else {
            console.log(`${colors.red}❌ Missing: ${file}${colors.reset}`);
        }
    });

    // 5. Create Checklist
    console.log("\n📝 Step 6: Creating deployment checklist...");
    const checklistContent = `# Vercel Deployment Checklist

## Backend Environment Variables (Set in Vercel)

\`\`\`bash
# Authentication
WORKOS_API_KEY=sk_test_your_key_here
WORKOS_CLIENT_ID=client_your_id_here
JWT_SECRET=your_random_32_char_secret
WORKOS_REDIRECT_URI=https://your-backend.vercel.app/auth/callback

# Database
TURSO_DB_URL=your_turso_url
TURSO_AUTH_TOKEN=your_turso_token
NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# AI
GEMINI_API_KEY=your_gemini_key

# Email (Optional)
RESEND_API_KEY=re_your_key
DEVELOPER_EMAIL=your@email.com

# CORS (CRITICAL!)
ALLOWED_ORIGINS=https://your-frontend.vercel.app
\`\`\`

## Frontend Environment Variables (Set in Vercel)

\`\`\`bash
VITE_QUERY_API_URL=https://your-backend.vercel.app
\`\`\`

## Pre-Deployment Steps

- [ ] Update WorkOS redirect URI in WorkOS dashboard
- [ ] Create Neon database table (run SQL from walkthrough)
- [ ] Set all environment variables in Vercel
- [ ] Test build locally: \`bun run build\`
- [ ] Verify .env files are in .gitignore
- [ ] Run lint: \`bun run lint\`

## Post-Deployment Steps

- [ ] Test authentication flow
- [ ] Test database connections
- [ ] Test feedback form submission
- [ ] Verify CORS is working
- [ ] Check browser console for errors
`;
    fs.writeFileSync('DEPLOYMENT_CHECKLIST.md', checklistContent);
    console.log(`${colors.green}✅ Created DEPLOYMENT_CHECKLIST.md${colors.reset}\n`);

    console.log("==========================================");
    console.log(`${colors.green}🎉 Deployment preparation complete!${colors.reset}`);
    console.log("==========================================");

} catch (error) {
    console.error(`${colors.red}❌ Error occurred: ${error.message}${colors.reset}`);
    process.exit(1);
}
