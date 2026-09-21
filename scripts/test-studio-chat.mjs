// UI contract checks with simulated APIs: never submits a paid generation.
// PLAYWRIGHT_MODULE may point to an existing Playwright install. TEST_CDP_URL
// connects an owned browser; omit it to launch Playwright's Chromium.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = process.env.TEST_CDP_URL
  ? await chromium.connectOverCDP(process.env.TEST_CDP_URL)
  : await chromium.launch({ headless: true });
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
await mkdir("outputs", { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
let balance = 10000, uploadCount = 0, pollCount = 0, quoteCount = 0;
let failSend = false, failedRecovery = false, quoteDelay = 0, failUpload = false;
let alreadyCompleted = false;
const submissions = [], consoleErrors = [];
page.on("pageerror", e => consoleErrors.push(e.message));
await context.route(`${base}/api/**`, async route => {
  const path = new URL(route.request().url()).pathname;
  const json = (data, status = 200) => route.fulfill({ status, json: data });
  if (path === "/api/config") return json({ ready: true, authenticated: true });
  if (path === "/api/account") return json({ balance: { total: balance }, isAdmin: false });
  if (path === "/api/uploads") {
    uploadCount++;
    if (failUpload) { failUpload = false; return json({ error: "Upload temporarily unavailable" }, 503); }
    return json({ uploadUrl: `${base}/__studio-test/upload`, headers: {}, token: `upload-${uploadCount}` });
  }
  if (path === "/api/quote") {
    quoteCount++;
    if (quoteDelay) await new Promise(r => setTimeout(r, quoteDelay));
    return json({ quoteToken: `quote-${quoteCount}`, credits: 240, duration: 5, resolution: route.request().postDataJSON().resolution });
  }
  if (path === "/api/generate") {
    submissions.push(route.request().postDataJSON());
    if (failSend) { failSend = false; return route.abort("failed"); }
    if (failedRecovery) { failedRecovery = false; return json({ error: "Your quote expired" }, 400); }
    pollCount = 0;
    return json({ token: "test-job", requestId: "test-generation-id", status: alreadyCompleted ? "completed" : "queued", balance: balance - 240 });
  }
  if (path === "/api/jobs") return json(!alreadyCompleted && ++pollCount < 2 ? { status: "in_progress" } : { status: "completed", videoUrl: "/media/alpine.mp4", balance: balance - 240 });
  // Block unexpected API requests rather than passing through to real services.
  return json({ error: `Unexpected test API ${path}` }, 501);
});
await context.route(`${base}/__studio-test/**`, route => route.fulfill({ status: 200, body: "" }));
const send = page.getByRole("button", { name: "Send and generate video" });
async function waitFor(predicate) { await page.waitForFunction(predicate, undefined, { timeout: 20000 }); }
async function readyVideo() {
  await page.getByLabel("Upload original video", { exact: true }).setInputFiles(resolve("public/media/alpine.mp4"));
  await page.getByText("240 credits", { exact: true }).waitFor();
  await page.getByLabel("Describe your video transformation").fill("Transform the mountains into a cinematic coastal landscape.");
  await page.getByRole("checkbox").check();
  await waitFor(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
}
try {
  await page.goto(`${base}/studio`);
  assert(await send.isDisabled());
  assert(await page.getByLabel("Upload reference images", { exact: true }).isDisabled());
  await readyVideo();
  await page.getByLabel("Upload reference images", { exact: true }).setInputFiles(resolve("public/media/arrival.jpg"));
  await waitFor(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  const beforeSettings = uploadCount;
  await page.getByRole("button", { name: "Seedance 2.5 Edit", exact: true }).click();
  quoteDelay = 800;
  await page.getByRole("combobox", { name: "Output quality" }).click();
  await page.getByRole("option", { name: "480p", exact: true }).click();
  assert(await send.isDisabled(), "old quote must not enable changed settings");
  await waitFor(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  assert.equal(uploadCount, beforeSettings, "settings changes reuse uploaded video");
  quoteDelay = 0;
  await page.getByRole("button", { name: "Close generation settings" }).click();
  await page.screenshot({ path: "outputs/studio-chat-ready.png", fullPage: true });
  await send.click();
  await page.getByText("Your new reality is ready.", { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].imageTokens.length, 1);
  assert.equal(submissions[0].resolution, "480p");
  assert.equal(submissions[0].consent, true);
  assert.equal(await page.getByLabel("Describe your video transformation").inputValue(), "");
  assert(await page.getByRole("link", { name: "Download video" }).isVisible());
  await page.screenshot({ path: "outputs/studio-chat-result.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "outputs/studio-chat-mobile.png", fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile must not overflow horizontally");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "New video", exact: true }).click();
  failUpload = true;
  await page.getByLabel("Upload original video", { exact: true }).setInputFiles(resolve("public/media/alpine.mp4"));
  await page.getByText("Upload temporarily unavailable", { exact: true }).waitFor();
  assert(await send.isDisabled());
  await page.getByRole("button", { name: /retry/i }).click();
  await page.getByText("240 credits", { exact: true }).waitFor();
  await page.getByLabel("Describe your video transformation").fill("Make this mountain landscape look like a tropical island.");
  await page.getByRole("checkbox").check();
  failSend = true;
  await send.click();
  await page.getByRole("button", { name: "Check request", exact: true }).waitFor();
  assert(await send.isDisabled());
  const originalId = submissions.at(-1).requestId;
  await page.reload();
  await page.getByRole("button", { name: "Check request", exact: true }).waitFor();
  failedRecovery = true;
  await page.getByRole("button", { name: "Check request", exact: true }).click();
  await page.getByText("Your quote expired", { exact: true }).waitFor();
  assert(await send.isDisabled(), "expired recovery must not authorize another send");
  assert.equal(submissions.at(-1).requestId, originalId);
  alreadyCompleted = true;
  await page.getByRole("button", { name: "Check request", exact: true }).click();
  await page.getByText("Your new reality is ready.", { exact: true }).waitFor({ timeout: 20000 });
  assert.equal(submissions.at(-1).requestId, originalId);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  balance = 10;
  await page.reload();
  await page.getByLabel("Upload original video", { exact: true }).setInputFiles(resolve("public/media/alpine.mp4"));
  await page.getByText("240 credits", { exact: true }).waitFor();
  await page.getByLabel("Describe your video transformation").fill("Turn the mountains into a cinematic coastal landscape.");
  await page.getByRole("checkbox").check();
  assert(await send.isDisabled(), "insufficient balance must block Send");
  assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
  console.log("PASS: automatic quote, references, settings invalidation, single Send, result, mobile, upload retry, recovery across reload, idempotency, insufficient credits.");
} finally {
  await context.close();
  await browser.close();
}
