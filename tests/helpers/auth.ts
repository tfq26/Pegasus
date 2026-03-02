import type { Page } from '@playwright/test';
import jwt from 'jsonwebtoken';

/**
 * Helper to handle authentication
 * For testing, we create a mock JWT session token
 */
export async function login(page: Page) {
    // Create a test JWT token
    // This matches JWT_SECRET in apps/backend/.env
    const jwtSecret = 'ef5be04da9505c0e4ffeb2355f64ec36914877733965fd3a67d61b5d69228926';

    // Create a test user payload
    const testUser = {
        sub: 'test-user-id-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
    };

    // Sign the token
    const token = jwt.sign(testUser, jwtSecret);

    // Set the session cookie
    await page.context().addCookies([{
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        expires: testUser.exp
    }]);

    // Navigate to the app first so we can set localStorage
    await page.goto('/');

    // Set the localStorage token for the ApiClient
    await page.evaluate((t) => {
        localStorage.setItem('auth_token', t);
    }, token);

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
}

/**
 * Navigate to settings page
 */
export async function navigateToSettings(page: Page) {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
}

/**
 * Navigate to database connections tab
 */
export async function navigateToDatabaseConnections(page: Page) {
    await navigateToSettings(page);

    // Click on Database Connections tab
    const dbTab = page.locator('button:has-text("Database Connections")');
    await dbTab.click();

    // Wait for the tab content to load
    await page.waitForSelector('text=Database Connections', { timeout: 5000 });
}
