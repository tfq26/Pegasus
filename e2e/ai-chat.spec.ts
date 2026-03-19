import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * AI Chat Interaction Tests
 * These tests verify that the AI chat interface (Halo Search) correctly 
 * accepts input, shows thinking states, and provides responses.
 */
test.describe('AI Chat Questions', () => {
    test.beforeEach(async ({ page }) => {
        // Log in using the test helper
        await login(page);
        
        // Navigate to the unified query/chat view
        await page.goto('/query');
        
        // Wait for the Halo Search editor to be ready
        await page.waitForSelector('div[contenteditable="true"]', { state: 'visible', timeout: 15000 });
        
        // Small delay to ensure all stores are initialized
        await page.waitForTimeout(1000);
    });

    test('should ask: "How can I connect to a PostgreSQL database?"', async ({ page }) => {
        const editor = page.locator('div[contenteditable="true"]');
        
        // Focus and type the question
        await editor.click();
        await editor.type('How can I connect to a PostgreSQL database?');
        
        // Submit via Enter key
        await editor.press('Enter');

        // 1. Verify thinking state appears
        // Using "Analyzing..." as it's the text in ChatEditor.vue line 347
        await expect(page.locator('text=Analyzing...')).toBeVisible();

        // 2. Wait for response to complete (up to 45 seconds for AI work)
        await expect(page.locator('text=Analyzing...')).not.toBeVisible({ timeout: 45000 });
        
        // 3. Verify that an assistant response appeared
        // Assistant responses are marked by "Pegasus" label (ChatEditor.vue line 62)
        const assistantLabel = page.locator('span:has-text("Pegasus")').last();
        await expect(assistantLabel).toBeVisible();
    });

    test('should ask: "What are the main features of Pegasus?"', async ({ page }) => {
        const editor = page.locator('div[contenteditable="true"]');
        
        await editor.click();
        await editor.type('What are the main features of Pegasus?');
        await editor.press('Enter');

        await expect(page.locator('text=Analyzing...')).toBeVisible();
        await expect(page.locator('text=Analyzing...')).not.toBeVisible({ timeout: 45000 });
        
        // Check for presence of "Pegasus" in the response area
        const responseArea = page.locator('div.mx-auto.max-w-4xl');
        await expect(responseArea).toContainText(/Pegasus/i);
    });

    test('should ask: "Can you help me visualize sales data from a CSV file?"', async ({ page }) => {
        const editor = page.locator('div[contenteditable="true"]');
        
        await editor.click();
        await editor.type('Can you help me visualize sales data from a CSV file?');
        await editor.press('Enter');

        // Verify the loading workflow
        await expect(page.locator('text=Analyzing...')).toBeVisible();
        await expect(page.locator('text=Analyzing...')).not.toBeVisible({ timeout: 45000 });
        
        // Verify response exists
        const messages = page.locator('.break-words');
        await expect(messages.count()).toBeGreaterThan(1);
    });

    test('should ask: "How do I create a new dashboard and add charts to it?"', async ({ page }) => {
        const editor = page.locator('div[contenteditable="true"]');
        
        await editor.click();
        await editor.type('How do I create a new dashboard and add charts to it?');
        await editor.press('Enter');

        await expect(page.locator('text=Analyzing...')).toBeVisible();
        await expect(page.locator('text=Analyzing...')).not.toBeVisible({ timeout: 45000 });
        
        // Verify "Pegasus" response
        await expect(page.locator('span:has-text("Pegasus")').last()).toBeVisible();
    });
});
