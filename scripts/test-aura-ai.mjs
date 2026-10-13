// Mock only the planner boundary; use real frame extraction and MP4 rendering.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://localhost:3012";
const dir = await mkdtemp(join(tmpdir(), "aura-ai-"));
const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || "chrome" });
const plan = { summary: "Open on clip 2, then cut into a faster finish.", shots: [
  { source: 1, sourceStart: 0, sourceEnd: 2, beats: 8, style: "midnight" },
  { source: 0, sourceStart: 1, sourceEnd: 2, beats: 4, style: "velocity" },
  { source: 1, sourceStart: 2, sourceEnd: 3, beats: 4, style: "clean" },
] };
const errors = [], requests = [];
let page, mode = "success", authenticated = true, enabled = true;
try {
  for (let i = 0; i < 2; i++) execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", i ? "color=c=blue:size=240x320:rate=30" : "color=c=red:size=240x320:rate=30", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, `clip-${i}.mp4`)]);
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce" });
  page.on("pageerror", error => errors.push(error.message));
  await page.route(`${base}/api/aura/plan`, async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { enabled, authenticated } });
    const body = route.request().postDataJSON(); requests.push(body);
    assert(body.clips.every(clip => clip.frames.length === 3 && clip.frames.every(frame => frame.image.startsWith("data:image/jpeg;base64,/9j/") && frame.image.length < 65000)));
    if (mode === "limit") return route.fulfill({ status: 429, json: { error: "The AI planning limit has been reached." } });
    if (mode === "invalid") return route.fulfill({ json: { plan: { ...plan, shots: [{ ...plan.shots[0], sourceEnd: 999 }] } } });
    return route.fulfill({ json: { plan } });
  });
  await page.goto(`${base}/aura`); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Essential only" }).click();
  await page.getByLabel("Upload aura clips").setInputFiles([join(dir, "clip-0.mp4"), join(dir, "clip-1.mp4")]);
  await page.getByText("clip-1.mp4", { exact: true }).waitFor();
  await page.getByLabel("Length", { exact: true }).selectOption("8");
  await page.getByRole("button", { name: /After hours/ }).click();
  await page.getByLabel("AI edit instructions").fill("Start on the blue clip and finish fast.");
  await page.getByRole("button", { name: "Plan with AI" }).click();
  await page.getByText("AI plan ready · 3 shots", { exact: true }).waitFor();
  assert.equal(requests.length, 1); assert.equal(requests[0].previousPlan, undefined);
  await page.getByText("Review the cuts", { exact: true }).click();
  await page.getByLabel("Format", { exact: true }).selectOption("1:1");
  assert.equal(await page.getByText("AI plan ready · 3 shots", { exact: true }).count(), 1, "framing changes preserve the plan");
  await page.getByRole("button", { name: "Create aura edit" }).click();
  const download = page.getByRole("link", { name: /Download your edit/ });
  await download.waitFor({ timeout: 120000 });
  const pending = page.waitForEvent("download"); await download.click();
  const output = join(dir, "ai.mp4"); await (await pending).saveAs(output);
  // AI starts on blue even though the first uploaded file is red.
  const pixel = execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", output, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  assert(pixel[2] > pixel[0] + 30, `expected blue opening, got ${[...pixel]}`);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
  await page.getByLabel("AI edit instructions").fill("Use more of the second clip.");
  await page.getByRole("button", { name: "Revise AI plan" }).click();
  await page.getByRole("button", { name: "Create aura edit" }).waitFor();
  assert.deepEqual(requests[1].previousPlan, plan);
  mode = "limit";
  await page.getByLabel("AI edit instructions").fill("Make it faster again.");
  await page.getByRole("button", { name: "Revise AI plan" }).click();
  await page.getByRole("alert").filter({ hasText: "planning limit" }).waitFor();
  assert.equal(await page.getByText("AI plan ready · 3 shots", { exact: true }).count(), 1);
  mode = "invalid";
  await page.getByRole("button", { name: "Revise AI plan" }).click();
  await page.getByRole("alert").filter({ hasText: "invalid edit plan" }).waitFor();
  assert.equal(await page.getByText("AI plan ready · 3 shots", { exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir("outputs", { recursive: true }); await page.screenshot({ path: "outputs/aura-ai-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /^Velocity/ }).click();
  assert.equal(await page.getByText("AI plan ready · 3 shots", { exact: true }).count(), 0, "manual styles clear stale plans");
  authenticated = false;
  await page.reload(); await page.getByRole("link", { name: "Sign in to use AI planning" }).waitFor();
  enabled = false;
  await page.reload(); await page.getByText(/AI planning isn’t connected yet/).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS real JPEG sampling, AI plan review, source-order rendering, audio/video export, follow-up context, error preservation, manual fallback, disabled/signed-out states, mobile layout. No OpenAI calls.");
} catch (error) {
  if (page) console.error((await page.locator("body").innerText()).slice(-2000));
  throw error;
} finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
