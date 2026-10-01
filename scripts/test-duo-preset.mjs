// Preset flow with simulated APIs; never starts a paid generation.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const base = process.env.TEST_BASE_URL || 'http://localhost:3012';
const car = process.env.TEST_PRESET === 'car';
const trio = process.env.TEST_PRESET === 'trio';
const presetId = car ? 'car-crew-swap' : trio ? 'trio-character-swap' : 'duo-character-swap';
const presetName = car ? 'Car crew swap' : trio ? 'Trio character swap' : 'Duo character swap';
const count = car || trio ? 3 : 2;
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const submissions = [], errors = [];
let uploads = 0;
page.on('pageerror', e => errors.push(e.message));
await context.route(`${base}/api/**`, async route => {
  const path = new URL(route.request().url()).pathname;
  const json = data => route.fulfill({ json: data });
  if (path === '/api/config') return json({ ready: true, authenticated: true });
  if (path === '/api/account') return json({ balance: { total: 10000 }, isAdmin: false, account: { plan: 'studio', paid_until: '2099-01-01T00:00:00Z' } });
  if (path === '/api/uploads') return json({ uploadUrl: `${base}/__test-upload`, headers: {}, token: `upload-${++uploads}` });
  if (path === '/api/library') return json({ items: [] });
  if (path === '/api/quote') return json({ quoteToken: 'test-quote', credits: 240, duration: car ? 20.05 : trio ? 18.04 : 24.05 });
  if (path === '/api/generate') { submissions.push(route.request().postDataJSON()); return json({ token: 'test-job', requestId: 'test-request', status: 'queued', balance: 9760 }); }
  if (path === '/api/jobs') return json({ status: 'completed', videoUrl: `/media/presets/${presetId}.mp4`, balance: 9760 });
  return route.fulfill({ status: 501, json: { error: 'Unexpected test endpoint' } });
});
await context.route(`${base}/__test-upload`, route => route.fulfill({ body: '' }));
const prompt = car ? 'Replace the man in the orange shirt in the front seat with @image1, replace the man in the red cap and green jacket in the back seat with @image2, and replace the man in the pink-and-navy striped shirt in the back seat with @image3. Only swap the characters. Keep each replacement consistent across every camera cut. Preserve the original movements, gestures, facial expressions, timing, camera movements, car interior, and background.' : trio ? 'Replace the first guy with @image1 replace the guy holding the camera with @image2 and replace the guy coming out the car with @image3. The characters are just swapping, movements should stay the same.' : 'Replace the guy on the right (@image1) and replace the guy on the left with (@image2). Just swap the characters, the movements should stay the same.';
const send = page.getByRole('button', { name: 'Send and generate video' });
async function loaded() {
  await page.getByText(`${presetName}.mp4`, { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Describe your video transformation').inputValue(), prompt);
  assert(await page.getByRole('radio', { name: 'Motion Transfer', exact: true }).isChecked());
  await page.waitForFunction(min => document.querySelector('[aria-label="Original video preview"]').duration > min, car ? 20 : trio ? 18 : 24);
  await page.getByText(`Video and ${count} references required`, { exact: true }).waitFor();
}
try {
  await page.goto(`${base}/studio?useCase=${presetId}`);
  await loaded();
  assert(await send.isDisabled());
  await page.getByLabel('Upload reference images', { exact: true }).setInputFiles(resolve('public/media/arrival.jpg'));
  await page.getByRole('checkbox').check();
  assert(await send.isDisabled(), 'one reference must not permit this preset prompt');
  await page.getByLabel('Upload reference images', { exact: true }).setInputFiles(resolve('public/media/escape.jpg'));
  if (count === 3) {
    assert(await send.isDisabled(), 'two references must not permit the three-person prompt');
    await page.getByLabel('Upload reference images', { exact: true }).setInputFiles(resolve('public/media/alpine.jpg'));
  }
  await page.waitForFunction(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  await page.getByRole('button', { name: 'Remove reference 1', exact: true }).click();
  assert.equal(await page.getByLabel('Describe your video transformation').inputValue(), prompt, 'preset positions stay distinct when a reference is removed');
  assert(await send.isDisabled());
  await page.getByLabel('Upload reference images', { exact: true }).setInputFiles(resolve('public/media/arrival.jpg'));
  await page.waitForFunction(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  await send.click();
  await page.getByText('Your video is ready.', { exact: true }).waitFor();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].prompt, prompt);
  assert.equal(submissions[0].model, 'genjutsu-motion');
  assert.equal(submissions[0].imageTokens.length, count);
  assert(submissions[0].videoToken);
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await page.getByRole('button', { name: presetName, exact: true }).first().click();
  await loaded();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'outputs/duo-preset-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await context.route(`${base}/media/presets/${presetId}.mp4`, route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: presetName, exact: true }).first().click();
  await page.getByText('Couldn’t load this preset’s video. Select the preset again to retry.').waitFor();
  assert.equal(await page.getByLabel('Original video preview').count(), 0);
  assert(await send.isDisabled());
  await context.unroute(`${base}/media/presets/${presetId}.mp4`);
  let releaseDownload;
  const gate = new Promise(resolve => { releaseDownload = resolve; });
  await context.route(`${base}/media/presets/${presetId}.mp4`, async route => { await gate; await route.continue(); });
  await page.getByRole('button', { name: presetName, exact: true }).first().click();
  await page.getByRole('button', { name: 'Character remix', exact: true }).first().click();
  releaseDownload();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByLabel('Original video preview').count(), 0, 'late preset download cannot replace a newer selection');
  assert.match(await page.getByLabel('Describe your video transformation').inputValue(), /Transfer the main performer/);
  await page.goto(base);
  await page.locator(`a[href="/studio?useCase=${presetId}"] img`).waitFor();
  assert.equal(await page.locator(`a[href="/studio?useCase=${presetId}"] img`).evaluate(el => el.naturalWidth), trio ? 720 : 1280);
  assert.deepEqual(errors, []);
  console.log('PASS preset link and click loading, model, exact prompt, required references, mock submission, reference removal, mobile layout, failed download, and stale download cancellation.');
} finally { await browser.close(); }
