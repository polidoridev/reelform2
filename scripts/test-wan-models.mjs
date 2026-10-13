// Browser contract check with simulated services; no paid generations.
// Run with node --import tsx scripts/test-wan-models.mjs.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { quoteCreation, quoteVideo } from "../lib/commerce/pricing.ts";
import { getVideoModel, modelEndpoint, modelRequest } from "../lib/video-models.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || "chrome" });
const base = process.env.TEST_BASE_URL || "http://localhost:3012";
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [], submissions = [], quotes = new Map();
let uploads = 0;
page.on("pageerror", error => errors.push(error.message));
await context.route(`${base}/api/**`, async route => {
  const path = new URL(route.request().url()).pathname;
  const json = (data, status = 200) => route.fulfill({ json: data, status });
  if (path === "/api/config") return json({ ready: true, authenticated: true });
  if (path === "/api/account") return json({ balance: { total: 10000 }, isAdmin: false, account: { plan: "studio", paid_until: "2099-01-01T00:00:00Z" } });
  if (path === "/api/library") return json({ items: [] });
  if (path === "/api/uploads") return json({ uploadUrl: `${base}/__wan-upload`, headers: {}, token: `upload-${++uploads}` });
  if (path === "/api/quote") {
    const p = route.request().postDataJSON();
    const media = { duration: 5, width: 1920, height: 1080, bytes: 2000 };
    const quote = p.videoToken ? { ...quoteVideo(media, p.resolution, p.model), media } : quoteCreation(p.duration, p.resolution, p.aspectRatio, p.model);
    const quoteToken = `quote-${quotes.size}`;
    quotes.set(quoteToken, { ...p, ...quote });
    return json({ ...quote, quoteToken });
  }
  if (path === "/api/generate") {
    const p = route.request().postDataJSON();
    const quote = quotes.get(p.quoteToken);
    const model = getVideoModel(p.model);
    const request = modelRequest(model, {
      prompt: p.prompt, videoUrl: p.videoToken ? "https://example.com/video.mp4" : null,
      imageUrls: p.imageTokens.map((_, i) => `https://example.com/image-${i}.jpg`),
      resolution: p.resolution, generateAudio: p.generateAudio, media: quote.media, aspectRatio: quote.aspectRatio,
    });
    submissions.push({ ...p, request, endpoint: modelEndpoint(model, { hasVideo: !!p.videoToken, imageCount: p.imageTokens.length }) });
    return json({ token: "test-job", requestId: "test-request", status: "queued", balance: 9000 });
  }
  if (path === "/api/jobs") return json({ status: "completed", videoUrl: "/media/alpine.mp4", balance: 9000 });
  return json({ error: `Unexpected test API ${path}` }, 501);
});
await context.route(`${base}/__wan-upload`, route => route.fulfill({ status: 200, body: "" }));
async function choose(name) {
  await page.locator(".chat-more-models").click();
  await page.getByRole("button", { name: new RegExp(`^${name} No video needed`) }).click();
}
async function option(label, name) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
const send = page.getByRole("button", { name: "Send and generate video" });
try {
  await page.goto(`${base}/studio`);
  await page.getByText("10,000 credits", { exact: true }).waitFor();
  await choose("Seedance 2.5 Create");
  await page.getByRole("button", { name: /No sound/ }).click();
  await option("Video shape", "21:9 · Cinematic");
  await page.getByRole("button", { name: "Close generation settings" }).click();
  await choose("Wan 3.0 Create");
  await page.getByRole("button", { name: /No sound/ }).click();
  assert.match(await page.getByRole("combobox", { name: "Video shape" }).innerText(), /16:9/);
  await page.getByRole("combobox", { name: "Video shape" }).click();
  assert.equal(await page.getByRole("option", { name: "21:9 · Cinematic" }).count(), 0);
  await page.getByRole("option", { name: "9:16 · Vertical" }).click();
  await option("Output quality", "720p HD");
  await option("Video length", "8 seconds");
  await option("Sound", "Generate audio");
  await page.getByRole("button", { name: "Close generation settings" }).click();
  await page.getByLabel("Describe your video transformation").fill("A red kite flying over a windy beach at sunset.");
  await page.getByText("290 credits", { exact: true }).waitFor();
  await send.click();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(submissions[0].endpoint, "alibaba/wan-3.0/text-to-video");
  assert.equal(submissions[0].request.aspect_ratio, "9:16");
  assert.equal(submissions[0].request.duration, 8);
  assert.equal(submissions[0].request.generate_audio, true);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await choose("Wan 3.0 Prime Create");
  await page.getByLabel("Upload original video", { exact: true }).setInputFiles(resolve("public/media/alpine.mp4"));
  await page.getByLabel("Upload reference images", { exact: true }).setInputFiles(resolve("public/media/arrival.jpg"));
  await page.getByLabel("Describe your video transformation").fill("Create a new scene inspired by @video with the person in @image1.");
  await page.getByRole("checkbox").check();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir("outputs", { recursive: true });
  await page.screenshot({ path: "outputs/wan-studio-mobile.png", fullPage: true });
  await send.click();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(submissions[1].endpoint, "alibaba/wan-3.0-prime/reference-to-video");
  assert.equal(submissions[1].request.video_urls.length, 1);
  assert.equal(submissions[1].request.image_urls.length, 1);
  assert.deepEqual(errors, []);
  console.log("PASS Wan model selection, supported shapes, shape fallback, actual quote math, text creation, video/photo references, submission adapters, playback and mobile layout. No paid provider calls.");
} finally { await browser.close(); }
