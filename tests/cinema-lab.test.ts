import test from "node:test";
import assert from "node:assert/strict";
import { CINEMA_PRESETS, DEFAULT_DIRECTION, compileCinemaPrompt, createCinemaSequence, initialCinemaPlan, parseCinemaPlan } from "../lib/cinema-lab";
import { getVideoModel, modelRequest, modelEndpoint, validateModelAspectRatio } from "../lib/video-models";
import { authDestination } from "../lib/auth-destination";

test("cinematic direction stays in the prompt and uses the existing provider schema", () => {
  const plan = initialCinemaPlan();
  const shot = { ...plan.shots[0], scene: "A woman in @image1 walks through the rainy city.", direction: { ...DEFAULT_DIRECTION, lens: "85mm portrait", movement: "Slow dolly in", lighting: "Neon night" } };
  const prompt = compileCinemaPrompt(shot, "Keep the red coat and silver watch.");
  assert.match(prompt, /Lens feel: 85mm portrait/);
  assert.match(prompt, /Continuity: Keep the red coat and silver watch/);
  assert.doesNotMatch(prompt, /Director's choice/);
  for (const id of ["seedance-2.5-reference", "seedance-2-reference", "wan-3-reference", "wan-3-prime-reference"]) {
    const model = getVideoModel(id);
    const request = modelRequest(model, { prompt, videoUrl: null, imageUrls: ["https://example.com/image.jpg"], resolution: "720p", generateAudio: true, media: { duration: 5, width: 1920, height: 1080 }, aspectRatio: "16:9" });
    assert.match(String(request.prompt), /85mm portrait/);
    assert.equal(request.duration, 5);
    assert.equal(request.aspect_ratio, "16:9");
    assert.deepEqual(request.image_urls, ["https://example.com/image.jpg"]);
    assert.equal(request.generate_audio, true);
    assert.equal("lens" in request, false);
    assert.equal("camera" in request, false);
    assert.equal(modelEndpoint(model, { hasVideo: false, imageCount: 1 }), model.endpoint);
    assert.equal(modelEndpoint(model, { hasVideo: false, imageCount: 0 }), model.textEndpoint);
  }
  assert.throws(() => validateModelAspectRatio(getVideoModel("wan-3-reference"), "21:9"));
});

test("browser drafts reject corrupted, oversized or unsupported direction", () => {
  assert.equal(parseCinemaPlan(null), null);
  assert.equal(parseCinemaPlan({ ...initialCinemaPlan(), shots: [] }), null);
  const plan = initialCinemaPlan();
  for (const preset of CINEMA_PRESETS) {
    assert.ok(parseCinemaPlan({ ...plan, shots: [{ ...plan.shots[0], direction: { ...DEFAULT_DIRECTION, ...preset.direction } }] }));
  }
  assert.equal(parseCinemaPlan({ ...plan, shots: [{ ...plan.shots[0], direction: { ...DEFAULT_DIRECTION, lens: "unsupported" } }] }), null);
  assert.equal(parseCinemaPlan({ ...plan, continuity: "x".repeat(401) }), null);
  assert.equal(parseCinemaPlan({ ...plan, shots: [plan.shots[0], plan.shots[0]] }), null);
  assert.equal(parseCinemaPlan({ ...plan, selected: "missing" })?.selected, plan.shots[0].id);
});

test("three-shot structures preserve scene and look while varying coverage", () => {
  let i = 0;
  const shots = createCinemaSequence("A car drives along the coast.", { ...DEFAULT_DIRECTION, lighting: "Golden hour" }, () => `shot-${++i}`);
  assert.equal(shots.length, 3);
  assert.equal(new Set(shots.map(shot => shot.id)).size, 3);
  assert.deepEqual(shots.map(shot => shot.direction.framing), ["Wide shot", "Medium shot", "Close-up"]);
  for (const shot of shots) {
    assert.match(shot.scene, /A car drives along the coast/);
    assert.equal(shot.direction.lighting, "Golden hour");
  }
});

test("CinemaLab sign-in destination is allowed without accepting arbitrary redirects", () => {
  assert.equal(authDestination("/cinemalab"), "/cinemalab");
  assert.equal(authDestination("/cinemalab?next=https://example.com"), "/account");
});
