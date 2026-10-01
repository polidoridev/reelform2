// Browser checks use simulated account data; no payments or generations.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
const base = process.env.TEST_BASE_URL || 'http://localhost:5173';
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let balance = 550, isAdmin = false;
await context.route(`${base}/api/**`, route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/config') return route.fulfill({ json: { ready: true, authenticated: true } });
  if (path === '/api/account') return route.fulfill({ json: { balance: { total: balance }, isAdmin, account: { plan: 'pro', paid_until: '2099-01-01T00:00:00Z' } } });
  if (path === '/api/library') return route.fulfill({ json: { items: [] } });
  return route.fulfill({ status: 501, json: { error: 'Unexpected test request' } });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(`${base}/studio`);
  await page.getByText('Your credits are running low', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Manage credits' }).getAttribute('href'), '/account?tab=credits');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: 'outputs/low-credit-mobile.png' });
  balance = 0;
  await page.reload();
  await page.getByText('You’re out of credits', { exact: true }).waitFor();
  balance = 551;
  await page.reload();
  await page.getByText('551 credits', { exact: true }).waitFor();
  assert.equal(await page.locator('.low-credit-notice').count(), 0);
  isAdmin = true; balance = 0;
  await page.reload();
  await page.getByText('Admin access', { exact: true }).waitFor();
  assert.equal(await page.locator('.low-credit-notice').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS mobile low/zero-credit warnings, purchase link, refill recovery, admin exclusion, no page errors');
} finally { await browser.close(); }
