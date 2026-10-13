// Browser contract test with simulated account, upload, quote and generation services.
// Run: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --import tsx scripts/test-cinema-lab.mjs
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { quoteCreation, quoteVideo } from "../lib/commerce/pricing.ts";
import { getVideoModel, modelEndpoint, modelRequest } from "../lib/video-models.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || "chrome" });
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3016";
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [], submissions = [], quotes = new Map();
let uploads = 0, signedIn = true;
const generationId = "12345678-1234-1234-1234-123456789abc";
page.on("pageerror", error => errors.push(error.message));
await context.route(`${base}/api/**`, async route => {
  const path = new URL(route.request().url()).pathname;
  const json = (data, status = 200) => route.fulfill({ json: data, status });
  if (path === "/api/config") return json({ ready: true, authenticated: signedIn });
  if (path === "/api/account") return json({ balance: { total: 10000 }, isAdmin: false, account: { user_id: "cinema-test-user", plan: "studio", paid_until: "2099-01-01T00:00:00Z" }, trial: { state: "available", attemptsRemaining: 3 } });
  if (path === "/api/library") return json({ items: [] });
  if (path === "/api/uploads") return json({ uploadUrl: `${base}/__cinema-upload`, headers: {}, token: `upload-${++uploads}` });
  if (path === "/api/quote") {
    const p = route.request().postDataJSON();
    const media = { duration: 5, width: 1920, height: 1080, bytes: 2000 };
    const quote = p.videoToken ? { ...quoteVideo(media, p.resolution, p.model), media } : quoteCreation(p.duration, p.resolution, p.aspectRatio, p.model);
    const quoteToken = `quote-${quotes.size}`;
    quotes.set(quoteToken, { ...p, ...quote });
    return json({ ...quote, quoteToken });
  }
  if (path === "/api/generate") {
    const p = route.request().postDataJSON(), quote = quotes.get(p.quoteToken), model = getVideoModel(p.model);
    const request = modelRequest(model, { prompt: p.prompt, videoUrl: p.videoToken ? "https://example.com/video.mp4" : null, imageUrls: p.imageTokens.map((_, i) => `https://example.com/image-${i}.jpg`), resolution: p.resolution, generateAudio: p.generateAudio, media: quote.media, aspectRatio: quote.aspectRatio });
    submissions.push({ ...p, request, endpoint: modelEndpoint(model, { hasVideo: !!p.videoToken, imageCount: p.imageTokens.length }) });
    return json({ token: "test-job", requestId: generationId, status: "queued", balance: 9000 });
  }
  if (path === "/api/jobs") return json({ status: "completed", videoUrl: "/media/alpine.mp4", balance: 9000 });
  return json({ error: `Unexpected test API ${path}` }, 501);
});
await context.route(`${base}/__cinema-upload`, route => route.fulfill({ status: 200, body: "" }));
async function option(label, name) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
const send = page.getByRole("button", { name: "Send and generate video" });
try {
  await page.goto(`${base}/cinemalab`);
  await page.getByText("10,000 credits", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "CinemaLab", exact: true }).getAttribute("aria-current"), "page");
  assert.match(await page.getByRole("combobox", { name: "CinemaLab model" }).innerText(), /Seedance 2.5 Create/);
  assert.equal(await send.isDisabled(), true);
  await page.getByLabel("What happens in this shot?").fill("A woman in a red coat walks through a rainy city.");
  await page.getByRole("button", { name: "Night exterior" }).click();
  await page.getByRole("tab", { name: "Camera", exact: true }).click();
  await page.getByLabel("Lens feel", { exact: true }).selectOption("85mm portrait");
  await page.getByRole("tab", { name: "Sequence", exact: true }).click();
  await page.getByLabel("Continuity notes for every shot").fill("Keep the red coat and silver watch.");
  await page.getByRole("button", { name: "Expand into 3 shots" }).click();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await page.getByRole("button", { name: "Duplicate shot" }).click();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 4);
  await page.getByRole("tab", { name: "Sequence", exact: true }).click();
  await page.getByRole("button", { name: "Move shot earlier" }).click();
  await page.getByRole("button", { name: "Remove selected shot" }).click();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await page.reload();
  await page.getByText("10,000 credits", { exact: true }).waitFor();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await page.getByRole("button", { name: "Use this shot" }).click();
  assert.match(await page.getByLabel("Describe your video transformation").inputValue(), /85mm portrait/);
  assert.match(await page.getByLabel("Describe your video transformation").inputValue(), /Keep the red coat and silver watch/);
  await page.getByRole("tab", { name: "Camera", exact: true }).click();
  await page.getByLabel("Camera angle", { exact: true }).selectOption("Low angle");
  assert.equal(await page.getByRole("button", { name: "Use this shot" }).isEnabled(), true);
  await page.getByRole("button", { name: "Use this shot" }).click();
  await option("Video shape", "21:9 · Cinematic");
  await option("CinemaLab model", "Wan 3.0 Create");
  assert.match(await page.getByRole("combobox", { name: "Video shape" }).innerText(), /16:9/);
  await option("Video shape", "9:16 · Vertical");
  await option("Video length", "8 seconds");
  await option("Output quality", "720p HD");
  await option("Sound", "Generate audio");
  await page.getByLabel("Upload reference images", { exact: true }).setInputFiles(resolve("public/media/arrival.jpg"));
  await page.getByLabel("Describe your video transformation").fill((await page.getByLabel("Describe your video transformation").inputValue()) + "\nUse the person in @image1.");
  assert.equal(await send.isDisabled(), true); // Files require consent, including reference-only generation.
  await page.getByRole("checkbox").check();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  await mkdir("outputs", { recursive: true });
  await page.screenshot({ path: "outputs/cinemalab-desktop.png", fullPage: true });
  await send.click();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(submissions[0].endpoint, "alibaba/wan-3.0/reference-to-video");
  assert.equal(submissions[0].request.aspect_ratio, "9:16");
  assert.equal(submissions[0].request.duration, 8);
  assert.equal(submissions[0].request.generate_audio, true);
  assert.match(submissions[0].request.prompt, /Camera angle: Low angle/);
  assert.equal(submissions[0].request.image_urls.length, 1);
  assert.equal(submissions[0].videoToken, undefined);
  assert.match(page.url(), /\/cinemalab\?generation=/);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/cinemalab");
  await page.getByRole("button", { name: "Use this shot" }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Send and generate video"]').disabled);
  await send.click();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(submissions[1].endpoint, "alibaba/wan-3.0/text-to-video");
  assert.equal(submissions[1].request.image_urls, undefined);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "outputs/cinemalab-mobile.png", fullPage: true });
  signedIn = false;
  await page.reload();
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Sign in", exact: true }).getAttribute("href"), "/login?next=%2Fcinemalab");
  assert.equal(await send.isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("PASS CinemaLab planning, camera/look prompts, sequence editing, draft reload, model constraints, reference-only uploads, consent, generation requests, result display, reset, sign-in destination and mobile layout. No paid provider calls.");
} finally { await browser.close(); }
