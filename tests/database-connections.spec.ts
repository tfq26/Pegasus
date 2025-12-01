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
        const mongoConfig = testConnections.mongodb.atlas;

        // Open modal
        await page.locator('button:has-text("Add Connection")').first().click();

        // Wait for modal dialog to be fully rendered
        await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(500); // Give the dialog content time to render

        // Fill in connection details
        await page.locator('input[placeholder*="Production DB"]').fill(mongoConfig.nickname);
        await page.locator('textarea[placeholder*="Optional description"]').fill(mongoConfig.description);

        // Select MongoDB provider
        await page.getByRole('combobox').click();
        // Use getByRole option which targets the accessible option element
        await page.getByRole('option', { name: 'MongoDB' }).click();

        // Fill in MongoDB connection string
        await page.locator('input[placeholder*="mongodb://"]').fill(mongoConfig.url);

        // Wait for schema discovery (should show databases or collections)
        // This might take a bit longer for Atlas
        await page.waitForTimeout(3000);

        // Check if discovery found something
        const discoverySection = page.locator('text=Discovered');
        const hasDiscovery = await discoverySection.isVisible().catch(() => false);

        if (hasDiscovery) {
            console.log('Schema discovery successful');
        }

        // Save connection
        await page.locator('button:has-text("Save Connection")').click();

        // Check for success toast or error toast
        // We expect the modal to close and the connection to appear

        // Verify connection appears in the list
        // Increase timeout to account for network latency
        await expect(page.locator(`text=${mongoConfig.nickname}`)).toBeVisible({ timeout: 15000 });

        // Verify provider badge
        await expect(page.locator('text=mongodb').first()).toBeVisible();
    });

    test('should test MongoDB connection', async ({ page }) => {
        const mongoConfig = testConnections.mongodb.atlas;

        // First add the connection
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(500);

        await page.locator('input[placeholder*="Production DB"]').fill(mongoConfig.nickname);

        await page.getByRole('combobox').click();
        await page.getByRole('option', { name: 'MongoDB' }).click();
        await page.locator('input[placeholder*="mongodb://"]').fill(mongoConfig.url);
        await page.waitForTimeout(2000);
        await page.locator('button:has-text("Save Connection")').click();

        // Wait for connection to appear
        await page.waitForSelector(`text=${mongoConfig.nickname}`, { timeout: 15000 });

        // Find and click the test connection button
        const connectionCard = page.locator(`article:has-text("${mongoConfig.nickname}")`);
        await connectionCard.locator('button[title="Test Connection"]').click();

        // Wait for connection status to update
        await page.waitForTimeout(3000);

        // Check for connection status (Connected or Error)
        // The status text might be "Connected" or "Connection error"
        const statusText = await connectionCard.locator('text=/Connected|Connection error/').textContent();
        console.log('Connection status:', statusText);

        // Verify we got some kind of status
        expect(statusText).toBeTruthy();
    });

    test('should delete a connection', async ({ page }) => {
        const mongoConfig = testConnections.mongodb.atlas;

        // Add a connection first
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(500);

        await page.locator('input[placeholder*="Production DB"]').fill('Test Delete Connection');

        await page.getByRole('combobox').click();
        await page.getByRole('option', { name: 'MongoDB' }).click();
        await page.locator('input[placeholder*="mongodb://"]').fill(mongoConfig.url);
        await page.waitForTimeout(1000);
        await page.locator('button:has-text("Save Connection")').click();

        // Wait for it to appear
        await page.waitForSelector('text=Test Delete Connection', { timeout: 15000 });

        // Delete it
        const connectionCard = page.locator('article:has-text("Test Delete Connection")');
        await connectionCard.locator('button[title="Remove Connection"]').click();

        // Verify it's gone
        await expect(page.locator('text=Test Delete Connection')).not.toBeVisible({ timeout: 5000 });
    });

    test('should not scan placeholder MongoDB URL', async ({ page }) => {
        await page.locator('button:has-text("Add Connection")').first().click();
        await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(500);

        await page.getByRole('combobox').click();
        await page.getByRole('option', { name: 'MongoDB' }).click();

        // The default placeholder should be visible
        const urlInput = page.locator('input[placeholder*="mongodb://"]');
        await expect(urlInput).toHaveValue('mongodb://127.0.0.1:27017');

        // Wait a bit to ensure no scanning happens
        await page.waitForTimeout(1000);

        // Should not show "Scanning..." text
        await expect(page.locator('text=Scanning...')).not.toBeVisible();
    });
});
