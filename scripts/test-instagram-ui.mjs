// Browser checks with simulated APIs. No Instagram authentication or publishing.
import assert from "node:assert/strict";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.TEST_APP_URL || "http://localhost:5173";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const id = "12345678-1234-4234-8234-123456789012";
let ready = true,
  eligible = true,
  connection = {
    id: "123456789",
    username: "reelform_creator",
    reconnectRequired: false,
  },
  post = null,
  submissions = [],
  connects = 0,
  loggedOut = false;
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await context.route(`${base}/api/**`, async (route) => {
  const url = new URL(route.request().url()),
    path = url.pathname;
  const json = (data, status = 200) => route.fulfill({ status, json: data });
  if (path === `/api/videos/${id}`)
    return route.fulfill({
      path: resolve("public/media/alpine.mp4"),
      contentType: "video/mp4",
    });
  if (path === "/api/instagram") {
    if (loggedOut)
      return json({ error: "Sign in with a verified email to continue." }, 401);
    if (route.request().method() === "DELETE") {
      connection = null;
      return json({ ok: true });
    }
    return json({
      ready,
      eligible,
      connection,
      posts: post ? [post] : [],
      selectedPost: post,
      video: url.searchParams.has("generation")
        ? { id, url: `/api/videos/${id}` }
        : null,
    });
  }
  if (path === "/api/instagram/connect") {
    connects++;
    return json(
      { error: "Simulated permission screen; no real account was contacted." },
      503,
    );
  }
  if (path === "/api/instagram/posts") {
    const body = route.request().postDataJSON();
    submissions.push(body);
    post = {
      id: "post-fixture",
      jobId: id,
      username: connection.username,
      caption: body.caption,
      shareToFeed: body.shareToFeed,
      status: body.scheduledAt ? "queued" : "processing",
      scheduledAt: body.scheduledAt || null,
      permalink: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    return json({ post }, 202);
  }
  if (path === "/api/instagram/posts/post-fixture") {
    if (route.request().method() === "DELETE") { post = { ...post, status: "cancelled" }; return json({ post }); }
    post = {
      ...post,
      status: "published",
      permalink: "https://www.instagram.com/reel/fixture/",
    };
    return json({ post });
  }
  return json({ error: "Unexpected test request" }, 500);
});
try {
  await page.goto(`${base}/instagram?generation=${id}`);
  if (await page.getByRole("button", { name: "Essential only" }).isVisible())
    await page.getByRole("button", { name: "Essential only" }).click();
  await page.getByLabel("Caption", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Caption", { exact: true }).inputValue(),
    "",
  );
  assert(
    await page
      .getByRole("button", { name: "Publish Reel", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("Caption", { exact: true })
    .fill("A new perspective. #reelform");
  await page.getByLabel("I’ve reviewed this video").check();
  assert(
    await page
      .getByRole("button", { name: "Publish Reel", exact: true })
      .isEnabled(),
  );
  await page.screenshot({
    path: "outputs/instagram-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "outputs/instagram-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile layout overflows",
  );
  await page.getByRole("button", { name: "Publish Reel", exact: true }).click();
  await page
    .getByRole("button", { name: "Check status", exact: true })
    .waitFor();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].consent, true);
  assert.equal(submissions[0].instagramAccountId, "123456789");
  assert.equal(submissions[0].caption, "A new perspective. #reelform");
  assert.equal(
    await page
      .getByRole("button", { name: "Publish Reel", exact: true })
      .count(),
    0,
  );
  await page.reload();
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await page
    .getByRole("link", { name: "View Reel on Instagram" })
    .first()
    .waitFor();
  assert.equal(submissions.length, 1);
  assert.equal(
    await page
      .getByRole("link", { name: "View Reel on Instagram" })
      .first()
      .getAttribute("href"),
    "https://www.instagram.com/reel/fixture/",
  );
  // Scheduled posting persists through reload and can be cancelled.
  post = null;
  await page.reload();
  assert.equal(await page.getByRole("button", { name: "Generate caption" }).count(), 0);
  await page.getByLabel("Caption", { exact: true }).fill("A quiet escape to the mountains. #Reels");
  await page.getByLabel("When to post", { exact: true }).selectOption("later");
  const future = new Date(Date.now() + 86400000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel("Date and time", { exact: true }).fill(local);
  await page.getByLabel("I’ve reviewed this video").check();
  await page.screenshot({ path: "outputs/instagram-scheduling-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "outputs/instagram-scheduling-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Schedule Reel", exact: true }).click();
  await page.getByText("Scheduled", { exact: true }).first().waitFor();
  assert.equal(submissions.length, 2);
  assert.equal(submissions[1].scheduledAt, new Date(local).toISOString());
  assert.equal(submissions[1].caption, "A quiet escape to the mountains. #Reels");
  await page.reload();
  await page.getByText("Scheduled", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Cancel post", exact: true }).first().click();
  await page.getByText("Cancelled", { exact: true }).waitFor();
  // A downgrade hides creation but retains disconnect and queued-post cancellation.
  eligible = false;
  await page.reload();
  await page.getByRole("link", { name: "Upgrade to Pro" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Generate caption" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Publish Reel", exact: true }).count(), 0);
  await page.screenshot({ path: "outputs/instagram-pro-upgrade.png", fullPage: true });
  eligible = true;
  await page.reload();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm disconnect", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Instagram", exact: true })
    .waitFor();
  assert.equal(connection, null);
  post = null;
  await page.reload();
  await page.getByLabel("I’ve reviewed this video").check();
  assert(
    await page
      .getByRole("button", { name: "Publish Reel", exact: true })
      .isDisabled(),
  );
  await page
    .getByRole("button", { name: "Connect Instagram", exact: true })
    .click();
  await page
    .getByText("Simulated permission screen; no real account was contacted.")
    .waitFor();
  assert.equal(connects, 1);
  ready = false;
  await page.reload();
  await page
    .getByText("Instagram publishing is being set up.", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Connect Instagram", exact: true })
      .count(),
    0,
  );
  loggedOut = true;
  await page.reload();
  await page.getByRole("link", { name: "Sign in to continue" }).waitFor();
  assert(
    (
      await page
        .getByRole("link", { name: "Sign in to continue" })
        .getAttribute("href")
    ).includes(encodeURIComponent(`/instagram?generation=${id}`)),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile layout, manual captions, Pro upgrade gate, scheduling in UTC, cancellation, explicit consent, single submission, reload recovery, publication link, disconnect, connection errors, disabled setup, and sign-in return path.",
  );
} finally {
  await browser.close();
}
