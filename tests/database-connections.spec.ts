
import { test, expect } from '@playwright/test';
import { login, navigateToDatabaseConnections } from './helpers/auth';
import { testConnections } from './fixtures/test-connections';

test.describe('Database Connections', () => {
    test.beforeEach(async ({ page }) => {
        // Enable console logging from the browser to debug issues
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));

        await login(page);
        await navigateToDatabaseConnections(page);
    });

    test('should display database connections page', async ({ page }) => {
        await expect(page.locator('h2:has-text("Database Connections")')).toBeVisible();
        await expect(page.locator('button:has-text("Add Connection")').first()).toBeVisible();
    });

    test('should open add connection modal', async ({ page }) => {
        await page.locator('button:has-text("Add Connection")').first().click();

        await expect(page.locator('text=Add Database Connection')).toBeVisible();
        await expect(page.locator('input[placeholder*="Production DB"]')).toBeVisible();
    });

    test('should add MongoDB Atlas connection', async ({ page }) => {
        const uniqueName = `Atlas-${Date.now()}`;
        const mongoConfig = {
            nickname: uniqueName,
            description: 'MongoDB Atlas test cluster',
            url: process.env.TEST_MONGODB_URL || 'mongodb+srv://pegasus:pegasus@pegasus.mongodb.net/test'
        };

        await page.click('button:has-text("Add Connection")');

        // Fill in connection details
        await page.locator('input[placeholder*="Production DB"]').fill(mongoConfig.nickname);
        await page.locator('textarea[placeholder*="What is this data source used for?"]').fill(mongoConfig.description);

        // Select MongoDB provider from sidebar
        await page.getByRole('button', { name: 'MongoDB' }).click();

        // Fill in MongoDB URL
        await page.locator('input[placeholder*="mongodb"]').fill(mongoConfig.url);

        // Wait for schema discovery
        await page.waitForTimeout(2000);

        const discoveryLoading = page.locator('text=Discovering schema...');
        if (await discoveryLoading.isVisible()) {
            await expect(discoveryLoading).not.toBeVisible({ timeout: 15000 });
        }

        const saveButton = page.getByRole('button', { name: 'Connect Source' });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        // Wait for success toast
        await expect(page.locator('text=Connection added')).toBeVisible({ timeout: 10000 });

        // Verify connection appears in the list
        await expect(page.locator('article').filter({ hasText: uniqueName })).toBeVisible({ timeout: 15000 });

        // Verify provider badge
        await expect(page.locator('article').filter({ hasText: uniqueName }).locator('text=mongodb').first()).toBeVisible();
    });

    test('should test MongoDB connection', async ({ page }) => {
        const uniqueName = `Test-${Date.now()}`;
        const mongoConfig = {
            nickname: uniqueName,
            url: testConnections.mongodb.atlas.url
        };

        // Add the connection
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.locator('input[placeholder*="Production DB"]').fill(mongoConfig.nickname);
        await page.getByRole('button', { name: 'MongoDB' }).click();
        await page.locator('input[placeholder*="mongodb"]').fill(mongoConfig.url);
        await page.waitForTimeout(2000);
        await page.getByRole('button', { name: 'Connect Source' }).click();

        // Wait for connection to appear
        const card = page.locator('article').filter({ hasText: uniqueName });
        await expect(card).toBeVisible({ timeout: 15000 });

        // Test connection
        await card.locator('button[title="Test Connection"]').click();

        // Wait for status update
        await expect(card.locator('text=Connecting...')).not.toBeVisible({ timeout: 20000 });

        const statusLabel = card.locator('span.font-medium.text-stone-300');
        const statusText = await statusLabel.textContent();
        console.log('Connection status:', statusText);

        expect(statusText).toMatch(/Connected|Connection error/);
    });

    test('should delete a connection', async ({ page }) => {
        const uniqueName = `Delete-${Date.now()}`;

        // Add a connection first
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.locator('input[placeholder*="Production DB"]').fill(uniqueName);
        await page.getByRole('button', { name: 'MongoDB' }).click();
        await page.locator('input[placeholder*="mongodb"]').fill('mongodb://localhost:27017');
        await page.getByRole('button', { name: 'Connect Source' }).click();

        // Wait for it to appear
        const card = page.locator('article').filter({ hasText: uniqueName });
        await expect(card).toBeVisible({ timeout: 15000 });

        // Delete it
        await card.locator('button[title="Remove Connection"]').click();

        // Verify it's gone
        await expect(page.locator('article').filter({ hasText: uniqueName })).not.toBeVisible({ timeout: 5000 });
    });

    test('should not scan placeholder MongoDB URL', async ({ page }) => {
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.getByRole('button', { name: 'MongoDB' }).click();

        const urlInput = page.locator('input[placeholder*="mongodb"]');
        await expect(urlInput).toHaveValue('');

        await page.waitForTimeout(1000);
        await expect(page.locator('text=Scanning...')).not.toBeVisible();
    });
});
