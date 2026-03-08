import { test, expect } from '@playwright/test';

test.describe('Error Page', () => {
    test('displays unknown error correctly', async ({ page }) => {
        // Navigate to error page with UNKNOWN_ERROR code
        await page.goto('/error?code=UNKNOWN_ERROR');

        // 1. Verify Title
        await expect(page.locator('h1')).toHaveText('Application Error');

        // 2. Verify Default Message
        await expect(page.locator('text=An unexpected runtime error has occurred')).toBeVisible();

        // 3. Verify Action Button (Reload)
        const reloadBtn = page.getByRole('button', { name: 'Reload Application' });
        await expect(reloadBtn).toBeVisible();

        // 4. Verify Dashboard Button
        await expect(page.getByRole('button', { name: 'Back to Dashboard' })).toBeVisible();

        // 5. Verify Brand Logo
        const logo = page.getByRole('main').getByRole('img', { name: 'Pegasus Logo' });
        await expect(logo).toBeVisible();
    });

    test('displays custom message if provided', async ({ page }) => {
        const customMsg = 'This is a custom error message test.';
        await page.goto(`/error?code=UNKNOWN_ERROR&message=${encodeURIComponent(customMsg)}`);

        await expect(page.locator('p').filter({ hasText: customMsg })).toBeVisible();
    });
});
