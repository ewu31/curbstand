import { expect, test, type Page } from '@playwright/test';

async function register(page: Page, email: string, producer = false) {
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Integration Neighbor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('integration-password');
  if (producer) {
    await page.getByRole('radio', { name: 'Producer', exact: true }).check();
    await page.getByLabel('Farm name').fill('Integration Farm');
    await page.getByLabel('Potatoes', { exact: true }).check();
    await page.getByLabel('Farm latitude').fill('47.6685');
    await page.getByLabel('Farm longitude').fill('-122.385');
  }
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/you$/);
}
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('integration-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
test('real API registration, authentication, purchase and producer fulfillment', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const customer = `customer-${suffix}@example.test`;
  const producer = `producer-${suffix}@example.test`;
  await register(page, producer, true);
  await page.goto('/group-buys/new');
  await page.getByRole('combobox', { name: 'Produce', exact: true }).selectOption('potatoes');
  await page.getByRole('combobox', { name: 'Pickup location', exact: true }).selectOption('ballard-commons');
  await page.getByLabel('Minimum commitment (lb)').fill('18.25');
  await page.getByLabel('Price per pound ($)').fill('1.25');
  await page.getByRole('button', { name: 'Publish drop', exact: true }).click();
  await expect(page).toHaveURL(/\/group-buys\/[^/]+$/);
  await expect(page).not.toHaveURL(/\/new$/);
  const detail = page.url();
  await register(page, customer);
  await page.goto(detail);
  await page.getByRole('link', { name: 'Purchase', exact: true }).click();
  await page.getByLabel('Pounds', { exact: true }).fill('18.25');
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await expect(page.getByText('18.25 of 18.25 lb')).toBeVisible();
  await expect(page.locator('.drop-schedule')).toContainText('Drop confirmed');
  await login(page, producer);
  await page.goto(detail);
  await page.getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(page.getByText('Ready for pickup', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ready for pickup', { exact: true })).toBeVisible();
  await page.goto('/you');
  await expect(page.locator(`.listing-grid a[href="${new URL(detail).pathname}"]`)).toBeVisible();
});
