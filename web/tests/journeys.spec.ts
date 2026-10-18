import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('demo');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('customer and producer can complete a group buy', async ({ page }) => {
  await login(page, 'maya@curbstand.test');
  await page.goto('/group-buys/new');
  await page.getByLabel('Target (lb)').fill('18');
  await page.getByRole('button', { name: 'Create group buy' }).click();
  await expect(page).toHaveURL(/\/group-buys\/[\da-f-]+$/);
  const detailUrl = page.url();
  await page.getByLabel('Pounds', { exact: true }).fill('18');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('18 of 18 lb')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm deposit manually' }).click();
  await expect(page.locator('.people').getByText(/confirmed manually/)).toBeVisible();

  await login(page, 'elena@curbstand.test');
  await page.goto('/you');
  await expect(page.getByRole('heading', { name: 'Open requests' })).toBeVisible();
  await page.goto(detailUrl);
  await page.getByLabel('Price per lb', { exact: true }).fill('1.25');
  await page.getByLabel('Available pounds', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Place bid', exact: true }).click();
  await expect(page.locator('.bids').getByText('$1.25 / lb')).toBeVisible();

  await login(page, 'maya@curbstand.test');
  await page.goto(detailUrl);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByText('Matched', { exact: true })).toBeVisible();
  await login(page, 'elena@curbstand.test');
  await page.goto(detailUrl);
  await page.getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(page.getByText('Ready for pickup', { exact: true })).toBeVisible();
  await expect(page.getByText(/QR check-in is unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm manual pickup' }).click();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pickup: Completed', { exact: true })).toBeVisible();
  await page.goto('/you');
  await expect(page.locator('.listing-grid').getByRole('link', { name: /18 of 18 lb/ })).toBeVisible();
});

test('registration makes a usable demo customer and rejects invalid email', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('New Neighbor');
  await page.getByLabel('Email').fill('invalid');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid email address.');
  await page.getByLabel('Email').fill('neighbor@example.test');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/you$/);
  await page.goto('/?produce=apples');
  await page.locator('.listing-grid').getByRole('link').click();
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByText('10 of 40 lb')).toBeVisible();
});

test('phone detail and producer controls fit on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'elena@curbstand.test');
  await page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ }).click();
  await expect(page.getByRole('button', { name: 'Place bid' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/detail-mobile.png', fullPage: true });
});

test('failed detail requests offer retry and guests return after login', async ({ page }) => {
  await page.goto('/group-buys/missing');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.goto('/');
  await page.locator('.listing-grid').getByRole('link', { name: /Apples/ }).click();
  const detailUrl = page.url();
  await page.getByRole('link', { name: 'Log in to join or place a bid' }).click();
  await page.getByLabel('Email').fill('maya@curbstand.test');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(detailUrl);
});
