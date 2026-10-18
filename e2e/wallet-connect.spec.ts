import { test, expect } from '@playwright/test';
import { DEFAULT_FREIGHTER_MOCK, installFreighterMock } from './freighter-mock';

test.describe('Freighter Wallet Connection', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock the Freighter extension (accessed via @stellar/freighter-api)
    await context.addInitScript(installFreighterMock, DEFAULT_FREIGHTER_MOCK);
  });

  test('should display connect wallet button on home page', async ({ page }) => {
    await page.goto('/');
    const connectButton = page.getByRole('button', { name: /connect.*freighter/i });
    await expect(connectButton).toBeVisible();
  });

  test('should open Freighter connection flow when clicked', async ({ page }) => {
    await page.goto('/');
    const connectButton = page.getByRole('button', { name: /connect.*freighter/i });
    await connectButton.click();

    // After connection, should show wallet status or dashboard
    await expect(page).toHaveURL(/\/(dashboard|home)/, { timeout: 5000 });
  });

  test('should show network selector after wallet connection', async ({ page }) => {
    await page.goto('/');

    // Simulate wallet connection
    const connectButton = page.getByRole('button', { name: /connect.*freighter/i });
    await connectButton.click();

    // Look for network selector
    const networkSelect = page.locator('select').first();
    await expect(networkSelect).toBeVisible();
  });
});

test.describe('Wallet Connection Persistence', () => {
  test('should persist wallet connection state across page reloads', async ({ page, context }) => {
    // The connection lives in the extension, not in the app, so a reload with
    // the extension still reporting "connected" keeps the app connected.
    await context.addInitScript(installFreighterMock, {
      ...DEFAULT_FREIGHTER_MOCK,
      connected: true,
    });

    await page.goto('/');
    await page.reload();

    // Should still show wallet as connected (no connect button)
    const connectButton = page.getByRole('button', { name: /connect.*freighter/i });
    await expect(connectButton).not.toBeVisible();
  });

  test('should not cache the public key in local storage', async ({ page, context }) => {
    await context.addInitScript(installFreighterMock, {
      ...DEFAULT_FREIGHTER_MOCK,
      connected: true,
    });

    await page.goto('/');

    // The connected key must live only in the extension, never in the browser.
    expect(await page.evaluate(() => window.localStorage.getItem('freighter_public_key'))).toBeNull();
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__freighterPublicKey)).toBeUndefined();
  });
});
