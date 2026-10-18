import { expect, test } from '@playwright/test';
import { recommendedDrops } from '../src/lib/drops';
import { createFixtureDetails } from '../src/lib/fixtures';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('curbstand.welcomed', '1')); });

test('recommendations promote joinable drops near their minimum and exclude expired ones', () => {
  const base = createFixtureDetails()[0];
  const now = Date.now();
  const drop = { ...base, lowestBidPerLb: null, targetLbs: 100, status: 'funding' as const, joinDeadline: new Date(now + 86400000).toISOString() };
  const rows = [
    { ...drop, id: 'ordinary', committedLbs: 50 },
    { ...drop, id: 'expired', committedLbs: 99, joinDeadline: new Date(now - 1).toISOString() },
    { ...drop, id: 'close', committedLbs: 80 },
    { ...drop, id: 'closest', committedLbs: 95 },
    { ...drop, id: 'cancelled', committedLbs: 99, status: 'cancelled' as const },
  ];
  expect(recommendedDrops(rows, now).slice(0, 3).map(row => row.id)).toEqual(['closest', 'close', 'ordinary']);
  expect(rows[0].id).toBe('ordinary');
});

test('account menu opens with keyboard, closes on Escape and links to distributor and account pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(page.locator('.rail')).toHaveCount(0);
  const menu = page.getByLabel('Account menu');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Payment methods' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Payment methods' })).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole('link', { name: 'Become a distributor' }).click();
  await expect(page).toHaveURL(/distributor/);
  await expect(page.getByRole('heading', { name: 'Create a drop' })).toBeVisible();
  await page.getByLabel('Account menu').click();
  await page.locator('.menu-panel').getByRole('link', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await page.getByLabel('Account menu').click();
  await page.getByRole('link', { name: 'Payment methods' }).click();
  await expect(page.getByRole('heading', { name: 'Payment methods' })).toBeVisible();
});

test('drop details show seller fallback, description and a pickup countdown', async ({ page }) => {
  await page.goto('/');
  await page.locator('.card').first().click();
  await expect(page.getByRole('heading', { name: 'About this drop' })).toBeVisible();
  await expect(page.locator('.seller-expanded')).toContainText('Not yet rated');
  await expect(page.locator('.countdown')).toContainText(/\d+d \d+h \d+m/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
