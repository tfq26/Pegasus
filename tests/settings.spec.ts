import { test, expect } from '@playwright/test';
import { login, navigateToSettings } from './helpers/auth';

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await navigateToSettings(page);
    });

    test('should display settings page with all tabs', async ({ page }) => {
        await expect(page.locator('h2:has-text("Settings")')).toBeVisible();

        // Check all tabs are present
        const tabs = ['General', 'Pegasus AI', 'Queries', 'Data', 'Cloud', 'View', 'Integrations', 'Database Connections'];

        for (const tab of tabs) {
            await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
        }
    });

    test('should switch between tabs', async ({ page }) => {
        // Click on AI tab
        await page.locator('button:has-text("Pegasus AI")').click();
        await expect(page.locator('text=AI Detail Level')).toBeVisible();

        // Click on Queries tab
        await page.locator('button:has-text("Queries")').click();
        await expect(page.locator('text=Auto-save Queries')).toBeVisible();

        // Click on Database Connections tab
        await page.locator('button:has-text("Database Connections")').click();
        await expect(page.locator('h2:has-text("Database Connections")')).toBeVisible();
    });

    test('should save settings', async ({ page }) => {
        // Make a change to a setting
        await page.locator('button:has-text("General")').click();

        // Toggle a switch or change a value
        const compactModeToggle = page.locator('text=Compact Mode').locator('..').locator('button');
        await compactModeToggle.click();

        // Click save
        await page.locator('button:has-text("Save Changes")').click();

        // Should see success message
        await expect(page.locator('text=Settings saved!')).toBeVisible({ timeout: 5000 });
    });

    test('should persist settings after reload', async ({ page }) => {
        await page.locator('button:has-text("General")').click();

        // Get current state of a toggle
        const compactModeToggle = page.locator('text=Compact Mode').locator('..').locator('button');
        const initialState = await compactModeToggle.getAttribute('aria-checked');

        // Toggle it
        await compactModeToggle.click();

        // Save
        await page.locator('button:has-text("Save Changes")').click();
        await page.waitForTimeout(1000);

        // Reload page
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Navigate back to settings
        await navigateToSettings(page);

        // Check the state changed
        const newState = await compactModeToggle.getAttribute('aria-checked');
        expect(newState).not.toBe(initialState);
    });
});
