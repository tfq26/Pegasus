import { test, expect } from '@playwright/test';

test.describe('Error Page', () => {
    test('displays unknown error correctly', async ({ page }) => {
        // Navigate to error page with UNKNOWN_ERROR code
        await page.goto('/error?code=UNKNOWN_ERROR');

        // 1. Verify Title (Should be "Error" as defined in errorCodes.ts)
        await expect(page.locator('h1')).toHaveText('Error');

        // 2. Verify Default Message
        await expect(page.locator('text=An unexpected error occurred.')).toBeVisible();

        // 3. Verify Action Button (Retry)
        const retryBtn = page.getByRole('button', { name: 'Retry' });
        await expect(retryBtn).toBeVisible();

        // 4. Verify Secondary Button (Should be 'Cancel' since actionLabel exists)
        await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();

        // 5. Verify Error Icon (Red/Destructive)
        // The icon container has 'text-destructive' class for severity: 'error'
        const iconContainer = page.locator('.rounded-full.flex.items-center.justify-center');
        await expect(iconContainer).toHaveClass(/text-destructive/);
    });

    test('displays custom message if provided', async ({ page }) => {
        const customMsg = 'This is a custom error message test.';
        await page.goto(`/error?code=UNKNOWN_ERROR&message=${encodeURIComponent(customMsg)}`);

        await expect(page.locator('p.text-muted-foreground')).toHaveText(customMsg);
    });
});
