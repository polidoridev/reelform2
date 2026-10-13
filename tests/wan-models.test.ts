import test from "node:test";
import assert from "node:assert/strict";
import { getVideoModel, modelAspectRatios, modelEndpoint, modelRequest, validateModel } from "../lib/video-models";
import { quoteCreation, quoteVideo } from "../lib/commerce/pricing";

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

test("Wan quotes charge output seconds at standard resolution rates with and without footage", () => {
  const rates = {
    "wan-3-reference": { "480p": 0.05, "720p": 0.10, "1080p": 0.20 },
    "wan-3-prime-reference": { "480p": 0.068, "720p": 0.14, "1080p": 0.28 },
  } as const;
  for (const [id, prices] of Object.entries(rates)) {
    for (const resolution of ["480p", "720p", "1080p"] as const) {
      const expectedUsd = 9 * prices[resolution];
      const video = quoteVideo(input.media, resolution, id);
      const created = quoteCreation(8.2, resolution, "9:16", id);
      for (const quote of [video, created]) {
        assert.equal(quote.duration, 9);
        assert.equal(quote.estimatedProviderUsd, expectedUsd);
        assert.equal(quote.credits, Math.ceil(expectedUsd * 360 / 10) * 10);
      }
      assert.equal(quoteCreation(9, resolution, "1:1", id).credits, created.credits);
    }
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
