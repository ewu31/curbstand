import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('curbstand.welcomed', '1')); });

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
  await expect(page.locator('.topbar').getByRole('link', { name: 'Curbstand' })).toBeVisible();
  await expect(page.locator('.brand-bag').first()).toBeVisible();
  const widths = await page.evaluate(() => {
    const bar = document.querySelector('.topbar')?.getBoundingClientRect().width ?? 0;
    const search = document.querySelector('.search')?.getBoundingClientRect().width ?? 0;
    return { bar, search };
  });
  expect(widths.search).toBeGreaterThan(widths.bar * 0.75);
  await expect(page.getByRole('link', { name: 'Explore drops' })).toHaveCount(0);
  await expect(page.locator('.listing-grid .card')).toHaveCount(50);
  await expect(page.getByRole('heading', { name: 'Drops near you' })).toBeVisible();
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ })).toBeVisible();
  await expect(page.getByText('$1.40 / lb')).toBeVisible();
  await expect(page.getByText('32 of 50 lb')).toBeVisible();
  await expect(page.getByText('$1.25 / lb')).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Bids' })).toHaveCount(0);
  await expect(page.locator('.buy-price')).toBeVisible();
  await page.screenshot({ path: 'artifacts/detail-desktop.png', fullPage: true });
});

test('produce filter keeps apples and drops tomatoes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Apples', exact: true }).click();
  await expect(page).toHaveURL(/produce=apples/);
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ })).toHaveCount(0);
  await expect(page.locator('.listing-grid').getByRole('link', { name: /Apples/ })).toBeVisible();
  await expect(page.getByText('$1.25 / lb')).toBeVisible();
});

test('a producer can open the create form, keep an invalid draft, and publish a group buy', async ({ page }) => {
  await page.goto('/group-buys/new');
  await expect(page.getByRole('heading', { name: 'Create a drop' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Produce', exact: true })).toBeVisible();
  await expect(page.getByLabel('Minimum commitment (lb)')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Pickup location', exact: true })).toBeVisible();
  await expect(page.getByLabel('Join deadline')).toBeVisible();
  await expect(page.getByLabel('Price per pound ($)')).toBeVisible();
  await page.getByLabel('Minimum commitment (lb)').fill('');
  await page.getByRole('button', { name: 'Publish drop' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a target above 0 lb.');
  await expect(page.getByRole('combobox', { name: 'Produce', exact: true })).toHaveValue('tomatoes');

  await page.goto('/login');
  await page.getByLabel('Email').fill('elena@curbstand.test');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel('Account menu').click();
  await expect(page.locator('.menu-panel')).toContainText('elena@curbstand.test');

  await page.goto('/group-buys/new');
  await page.getByLabel('Minimum commitment (lb)').fill('18');
  await page.getByRole('button', { name: 'Publish drop' }).click();
  await expect(page).toHaveURL(/\/group-buys\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Tomatoes' })).toBeVisible();
  await expect(page.getByText('0 of 18 lb')).toBeVisible();

  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Your published drops' })).toBeVisible();
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
  await expect(page.getByLabel('Account menu')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: 'artifacts/browse-mobile.png', fullPage: false });
  expect(failures).toEqual([]);
});
