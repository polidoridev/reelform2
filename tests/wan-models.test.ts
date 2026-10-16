import test from "node:test";
import assert from "node:assert/strict";
import { getVideoModel, modelAspectRatios, modelEndpoint, modelRequest, validateModel } from "../lib/video-models";
import { quoteCreation, quoteVideo } from "../lib/commerce/pricing";
import { validateQuotedCredits } from "../lib/commerce/economics";

const input = {
  prompt: "A red kite flying over a beach at sunset",
  videoUrl: null,
  imageUrls: [] as string[],
  resolution: "720p",
  generateAudio: false,
  media: { duration: 8.2, width: 1920, height: 1080, bytes: 2000 },
  aspectRatio: "9:16" as const,
};
const models = ["wan-3-reference", "wan-3-prime-reference"];

test("Wan selects text or reference endpoints and sends only supported parameters", () => {
  for (const id of models) {
    const model = getVideoModel(id);
    const family = id === "wan-3-reference" ? "wan-3.0" : "wan-3.0-prime";
    assert.equal(modelEndpoint(model, { hasVideo: false, imageCount: 0 }), `alibaba/${family}/text-to-video`);
    assert.deepEqual(modelRequest(model, input), {
      prompt: input.prompt, resolution: "720p", generate_audio: false,
      duration: 9, aspect_ratio: "9:16", enable_thinking: false,
    });
    const imageUrls = ["https://example.com/person.jpg", "https://example.com/outfit.jpg"];
    assert.equal(modelEndpoint(model, { hasVideo: false, imageCount: 2 }), `alibaba/${family}/reference-to-video`);
    assert.deepEqual(modelRequest(model, { ...input, imageUrls, generateAudio: true }), {
      prompt: input.prompt, image_urls: imageUrls, resolution: "720p", generate_audio: true,
      duration: 9, aspect_ratio: "9:16", enable_thinking: false,
    });
    const videoUrl = "https://example.com/source.mp4";
    assert.equal(modelEndpoint(model, { hasVideo: true, imageCount: 0 }), model.endpoint);
    const request = modelRequest(model, { ...input, videoUrl, imageUrls });
    assert.deepEqual(request.video_urls, [videoUrl]);
    assert.deepEqual(request.image_urls, imageUrls);
    assert.equal(request.aspect_ratio, "16:9");
    assert.equal(request.duration, 9);
    assert.equal(modelRequest(model, { ...input, videoUrl, media: { ...input.media, width: 720, height: 1280 } }).aspect_ratio, "9:16");
    assert.equal(modelRequest(model, { ...input, videoUrl, media: { ...input.media, width: 720, height: 720 } }).aspect_ratio, "1:1");
  }
});

test("Wan bills source plus generated seconds; text and photo creation bill only output", () => {
  // Published list rates, checked 2026-10-15. An 8.2s source produces 9s:
  // bill 17.2s with a video, or just 9s for text/photo creation.
  const cases = [
    ["wan-3-reference", "480p", 0.86, 310, 0.45, 170],
    ["wan-3-reference", "720p", 1.72, 620, 0.90, 330],
    ["wan-3-reference", "1080p", 3.44, 1240, 1.80, 650],
    ["wan-3-prime-reference", "480p", 1.1696, 430, 0.612, 230],
    ["wan-3-prime-reference", "720p", 2.408, 870, 1.26, 460],
    ["wan-3-prime-reference", "1080p", 4.816, 1740, 2.52, 910],
  ] as const;
  for (const [id, resolution, videoUsd, videoCredits, creationUsd, creationCredits] of cases) {
    const video = quoteVideo(input.media, resolution, id);
    const created = quoteCreation(8.2, resolution, "9:16", id);
    assert.equal(video.duration, 9);
    assert.ok(Math.abs(video.estimatedProviderUsd - videoUsd) < 1e-9);
    assert.equal(video.credits, videoCredits);
    assert.equal(created.duration, 9);
    assert.ok(Math.abs(created.estimatedProviderUsd - creationUsd) < 1e-9);
    assert.equal(created.credits, creationCredits);
    assert.equal(quoteCreation(9, resolution, "1:1", id).credits, creationCredits);
  }
});

test("Wan includes measured fractional source duration and covers both duration limits", () => {
  for (const [id, duration, usd, credits] of [
    ["wan-3-reference", 4, 0.8, 290],
    ["wan-3-reference", 4.01, 0.901, 330],
    ["wan-3-reference", 30, 6, 2160],
    ["wan-3-prime-reference", 4, 1.12, 410],
    ["wan-3-prime-reference", 4.01, 1.2614, 460],
    ["wan-3-prime-reference", 30, 8.4, 3030],
  ] as const) {
    const media = { ...input.media, duration };
    const quote = quoteVideo(media, "720p", id);
    const request = modelRequest(getVideoModel(id), { ...input, media, videoUrl: "https://example.com/source.mp4" });
    assert.equal(quote.duration, request.duration);
    assert.ok(Math.abs(quote.estimatedProviderUsd - usd) < 1e-9);
    assert.equal(quote.credits, credits);
  }
});

test("old Wan video quotes require review before the corrected charge", () => {
  for (const [id, oldCredits, newCredits, usd] of [
    ["wan-3-reference", 360, 720, 2],
    ["wan-3-prime-reference", 510, 1010, 2.8],
  ] as const) {
    const quote = quoteVideo({ ...input.media, duration: 10 }, "720p", id);
    assert.ok(Math.abs(quote.estimatedProviderUsd - usd) < 1e-9);
    assert.equal(quote.credits, newCredits);
    assert.throws(() => validateQuotedCredits(oldCredits, quote.credits), /Refresh the quote/);
    assert.doesNotThrow(() => validateQuotedCredits(newCredits, quote.credits));
  }
});

test("Wan rejects unsupported shapes before quoting or submitting and keeps Reelform limits", () => {
  for (const id of models) {
    const model = getVideoModel(id);
    assert.deepEqual(modelAspectRatios(model), ["16:9", "9:16", "1:1", "4:3", "3:4"]);
    assert.throws(() => quoteCreation(5, "720p", "21:9", id), /does not support 21:9/);
    assert.throws(() => modelRequest(model, { ...input, aspectRatio: "21:9" }), /does not support 21:9/);
    assert.throws(() => validateModel(model, "720p", 31, 0), /between 4 and 30/);
    assert.throws(() => validateModel(model, "720p", 5, 5), /0–4 reference photos/);
    assert.doesNotThrow(() => validateModel(model, "1080p", 30, 4, true, false));
  }
  assert.ok(modelAspectRatios(getVideoModel("seedance-2.5-reference")).includes("21:9"));
});
