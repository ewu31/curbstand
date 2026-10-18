import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('curbstand.welcomed', '1')); });

test('shoppers can follow growers and compare grocery prices after setting a location', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('maya@curbstand.test');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByLabel('Account menu').click();
  await page.getByRole('link', { name: 'Following & followers' }).click();
  await expect(page.getByRole('heading', { name: 'Following', exact: true })).toBeVisible();
  await expect(page.getByRole('list').first()).toContainText('Ortiz Family Farm');
  await expect(page.getByRole('heading', { name: 'Followers', exact: true })).toBeVisible();

  await page.goto('/');
  await expect(page.locator('.card img').first()).toBeVisible();
  await page.locator('.listing-grid').getByRole('link', { name: /Tomatoes/ }).click();
  await expect(page.getByRole('heading', { name: 'Grocery prices around you' })).toBeVisible();
  await page.getByRole('button', { name: 'Following' }).click();
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();

  await page.goto('/profile#location');
  await page.getByLabel('Neighborhood or city').fill('Ballard');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('status')).toHaveText('Location saved.');

  await page.goto('/group-buys/4b6e2a10-1c2d-4e3f-8a01-aaaaaaaaaa02');
  await expect(page.getByRole('table')).toContainText('Neighborhood Grocer');
  await expect(page.locator('.seller-expanded img')).toBeVisible();
});
