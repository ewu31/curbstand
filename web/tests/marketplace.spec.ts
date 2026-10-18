import { expect, test, type Page } from '@playwright/test';

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('browse lists group buys without leaving the app', async ({ page }) => {
  const externalRequests: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') {
      externalRequests.push(request.url());
    }
  });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Curbstand' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Group buys' })).toBeVisible();
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ })).toBeVisible();
  await expect(page.getByText('$1.40 / lb')).toBeVisible();
  await expect(page.getByText('32 of 50 lb')).toBeVisible();
  await expect(page.getByText('No bids yet')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'artifacts/browse-desktop.png', fullPage: true });
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
});

test('a group buy opens from the grid', async ({ page }) => {
  await page.goto('/');
  await page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ }).click();
  await expect(page).toHaveURL(/\/group-buys\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Tomatoes' })).toBeVisible();
  await expect(page.getByText('32 of 50 lb')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bids' })).toBeVisible();
  await expect(page.locator('.bids').getByText('$1.40 / lb')).toBeVisible();
  await page.screenshot({ path: 'artifacts/detail-desktop.png', fullPage: true });
});

test('produce filter keeps apples and drops tomatoes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Apples', exact: true }).click();
  await expect(page).toHaveURL(/produce=apples/);
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ })).toHaveCount(0);
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Apples/ })).toBeVisible();
  await expect(page.getByText('No bids yet')).toBeVisible();
});

test('a customer can open the create form, keep an invalid draft, and publish a group buy', async ({ page }) => {
  await page.goto('/group-buys/new');
  await expect(page.getByRole('heading', { name: 'Create a group buy' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Produce', exact: true })).toBeVisible();
  await expect(page.getByLabel('Target (lb)')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Pickup location', exact: true })).toBeVisible();
  await expect(page.getByLabel('Join deadline')).toBeVisible();
  await expect(page.getByLabel('Bid deadline')).toBeVisible();
  await page.getByLabel('Target (lb)').fill('');
  await page.getByRole('button', { name: 'Create group buy' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a target above 0 lb.');
  await expect(page.getByRole('combobox', { name: 'Produce', exact: true })).toHaveValue('tomatoes');

  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@curbstand.test');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Maya Chen' })).toBeVisible();

  await page.goto('/group-buys/new');
  await page.getByLabel('Target (lb)').fill('18');
  await page.getByRole('button', { name: 'Create group buy' }).click();
  await expect(page).toHaveURL(/\/group-buys\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Tomatoes' })).toBeVisible();
  await expect(page.getByText('0 of 18 lb')).toBeVisible();

  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Created' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Joined' })).toBeVisible();
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ }).first()).toBeVisible();
});

test('unknown routes return a not-found page', async ({ page }) => {
  const response = await page.goto('/not-a-real-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
});

test('the grid stays on screen at a phone width', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'artifacts/browse-mobile.png', fullPage: false });
  expect(failures).toEqual([]);
});
