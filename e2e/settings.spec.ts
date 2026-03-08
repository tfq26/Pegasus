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
        const tabs = ['Profile', 'General', 'AI', 'Database Connections'];

        for (const tab of tabs) {
            await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
        }
    });

    test('should switch between tabs', async ({ page }) => {
        // Click on AI tab
        await page.locator('button:has-text("AI")').nth(0).click();
        await expect(page.locator('text=Model Provider')).toBeVisible();

        // Click on Database Connections tab
        await page.locator('button:has-text("Database Connections")').click();
        await expect(page.locator('h2:has-text("Database Connections")')).toBeVisible();

        // Click on Profile tab
        await page.locator('button:has-text("Profile")').click();
        await expect(page.locator('text=Transaction History').first()).toBeVisible();
    });

    test('should save settings', async ({ page }) => {
        // Make a change to a setting
        await page.locator('button:has-text("General")').click();
        await expect(page.locator('h2:has-text("General")')).toBeVisible();

        // Toggle a switch or change a value
        const destructiveToggle = page.locator('div.flex.justify-between', { hasText: 'Confirm Destructive Actions' }).getByRole('switch');
        await destructiveToggle.click();

        // Click save
        await page.locator('button:has-text("Save Changes")').click();

        // Should see success message
        await expect(page.locator('text=Settings saved!')).toBeVisible({ timeout: 5000 });
    });

    test('should persist settings after reload', async ({ page }) => {
        await page.locator('button:has-text("General")').click();
        await expect(page.locator('h2:has-text("General")')).toBeVisible();

        // Get current state of a toggle
        const toggleContainer = page.locator('div.flex.justify-between', { hasText: 'Confirm Destructive Actions' });
        const toggle = toggleContainer.getByRole('switch');
        const initialState = await toggle.getAttribute('data-state');

        // Toggle it
        await toggle.click();

        // Save
        await page.locator('button:has-text("Save Changes")').click();
        await page.waitForTimeout(1000);

        // Reload page
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Navigate back to settings
        await navigateToSettings(page);

        // Go back to General tab
        await page.locator('button:has-text("General")').click();

        // Check the state changed
        const newState = await page.locator('div.flex.justify-between', { hasText: 'Confirm Destructive Actions' }).getByRole('switch').getAttribute('data-state');
        expect(newState).not.toBe(initialState);
    });
});
