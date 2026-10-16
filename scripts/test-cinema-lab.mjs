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
  if (path === `/api/generations/${generationId}`) {
    const saved = submissions.at(-1);
    return json({ generation: { id: generationId, prompt: saved.prompt, model: saved.model, resolution: saved.resolution, generateAudio: saved.generateAudio, duration: saved.request.duration, aspectRatio: saved.request.aspect_ratio, trial: false, createdAt: new Date().toISOString(), status: "completed", result: "/media/alpine.mp4", assets: [] }, history: [], token: "test-job" });
  }
  if (path === "/api/jobs") return json({ status: "completed", videoUrl: "/media/alpine.mp4", balance: 9000 });
  return json({ error: `Unexpected test API ${path}` }, 501);
});
await context.route(`${base}/__cinema-upload`, route => route.fulfill({ status: 200, body: "" }));
async function option(label, name) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function step(name) {
  await page.getByRole("navigation", { name: "CinemaLab steps" }).getByRole("button", { name: new RegExp(name + "$" ) }).click();
}
const prompt = page.getByLabel("Final generation prompt", { exact: true });
const next = () => page.getByRole("button", { name: "Continue", exact: true }).click();
const back = () => page.getByRole("button", { name: "Back", exact: true }).click();
const send = page.getByRole("button", { name: "Generate shot" });
try {
  await page.goto(`${base}/cinemalab`);
  await page.getByRole("button", { name: "Essential only", exact: true }).click();
  await page.getByText("10,000 credits", { exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "CinemaLab", exact: true }).getAttribute("aria-current"), "page");
  assert.equal(await page.getByRole("combobox", { name: "CinemaLab model" }).isVisible(), false);
  assert.equal(await send.isVisible(), false);
  assert.equal(await page.getByRole("button", { name: "Back", exact: true }).isDisabled(), true);
  await step("Review");
  await page.getByText("Describe your shot in at least 10 characters before reviewing.", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("What happens in this shot?").isVisible(), true);
  await page.getByLabel("What happens in this shot?").fill("A woman in a red coat walks through a rainy city.");
  await page.getByRole("button", { name: "Night exterior" }).click();
  assert.equal(await page.getByLabel("What happens in this shot?").isVisible(), true);
  await next();
  assert.equal(await page.getByLabel("What happens in this shot?").isVisible(), false);
  await page.getByLabel("Lens feel", { exact: true }).selectOption("85mm portrait");
  await back();
  assert.match(await page.getByLabel("What happens in this shot?").inputValue(), /red coat/);
  await next();
  assert.equal(await page.getByLabel("Lens feel", { exact: true }).inputValue(), "85mm portrait");
  await next();
  assert.equal(await page.getByRole("heading", { name: "Look", exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel("Lens feel", { exact: true }).isVisible(), false);
  await step("Sequence");
  await page.getByLabel("Continuity notes for every shot").fill("Keep the red coat and silver watch.");
  await page.getByRole("button", { name: "Expand into 3 shots" }).click();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await page.getByRole("button", { name: "Duplicate shot" }).click();
  assert.equal(await page.getByLabel("Shot name").isVisible(), true);
  await step("Sequence");
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 4);
  await page.getByRole("button", { name: "Move shot earlier" }).click();
  await page.getByRole("button", { name: "Remove selected shot" }).click();
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await page.reload();
  await page.getByText("10,000 credits", { exact: true }).waitFor();
  await step("Sequence");
  assert.equal(await page.locator(".cinemalab-shotlist li").count(), 3);
  await step("Review");
  assert.match(await prompt.inputValue(), /85mm portrait/);
  assert.match(await prompt.inputValue(), /Keep the red coat and silver watch/);
  await step("Camera");
  await page.getByLabel("Camera angle", { exact: true }).selectOption("Low angle");
  await step("Review");
  assert.match(await prompt.inputValue(), /Low angle/);
  await back();
  assert.equal(await prompt.isVisible(), false);
  assert.equal(await send.isVisible(), false);
  assert.match(await page.getByRole("combobox", { name: "CinemaLab model" }).innerText(), /Seedance 2.5 Create/);
  await option("Video shape", "21:9 · Cinematic");
  await option("CinemaLab model", "Wan 3.0 Create");
  assert.match(await page.getByRole("combobox", { name: "Video shape" }).innerText(), /16:9/);
  await option("Video shape", "9:16 · Vertical");
  await option("Video length", "8 seconds");
  await option("Output quality", "720p HD");
  await option("Sound", "Generate audio");
  await page.getByLabel("Upload reference images", { exact: true }).setInputFiles(resolve("public/media/arrival.jpg"));
  await page.getByRole("button", { name: "Review shot", exact: true }).click();
  assert.equal(await page.getByRole("combobox", { name: "CinemaLab model" }).isVisible(), false);
  await prompt.fill((await prompt.inputValue()) + "\nUse the person in @image1.");
  const editedPrompt = await prompt.inputValue();
  await page.getByRole("button", { name: /Edit output/ }).click();
  assert.match(await page.getByRole("combobox", { name: "Video shape" }).innerText(), /9:16/);
  assert.equal(await page.getByRole("button", { name: "Remove reference 1" }).isVisible(), true);
  await page.getByRole("button", { name: "Review shot", exact: true }).click();
  assert.equal(await prompt.inputValue(), editedPrompt);
  assert.equal(await send.isDisabled(), true); // Files require consent, including reference-only generation.
  await page.getByRole("checkbox").check();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Generate shot"]').disabled);
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
  await step("Review");
  await page.waitForFunction(() => !document.querySelector('[aria-label="Generate shot"]').disabled);
  await send.click();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(submissions[1].endpoint, "alibaba/wan-3.0/text-to-video");
  assert.equal(submissions[1].request.image_urls, undefined);
  const savedPrompt = await prompt.inputValue();
  await page.reload();
  await page.getByText("Your video is ready.", { exact: true }).waitFor();
  assert.equal(await prompt.isVisible(), true);
  assert.equal(await prompt.inputValue(), savedPrompt);
  await back();
  await page.getByRole("button", { name: "Review shot", exact: true }).click();
  assert.equal(await prompt.inputValue(), savedPrompt);
  assert.equal(await prompt.evaluate(el => el.scrollTop), 0);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "outputs/cinemalab-mobile.png", fullPage: true });
  for (const name of ["Camera", "Look", "Sequence", "Output", "Review"]) {
    await step(name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow in ${name}`);
    await page.screenshot({ path: `outputs/cinemalab-mobile-${name.toLowerCase()}.png`, fullPage: true });
  }
  signedIn = false;
  await page.reload();
  await step("Review");
  await page.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Sign in", exact: true }).getAttribute("href"), "/login?next=%2Fcinemalab");
  await step("Review");
  assert.equal(await send.isDisabled(), true);
  await page.goto(`${base}/studio`);
  await page.getByLabel("Describe your video transformation").waitFor();
  assert.equal(await page.getByRole("button", { name: "Send and generate video" }).isVisible(), true);
  assert.equal(await page.getByRole("navigation", { name: "CinemaLab steps" }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS CinemaLab one-step navigation, back/forward state and prompt preservation, standard studio smoke, planning, camera/look prompts, sequence editing, draft reload, model constraints, reference-only uploads, consent, generation requests, result display, reset, sign-in destination and mobile layout. No paid provider calls.");
} finally { await browser.close(); }
