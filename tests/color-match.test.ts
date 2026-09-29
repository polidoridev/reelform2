import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { colorCorrection, correctionFilter, matchColors, sampleColors } from "../lib/color-match";
import { getVideoModel, VIDEO_MODELS } from "../lib/video-models";

// A scene of flat colour patches, and the same scene as a model might regrade it.
function scene(grade: (rgb: number[]) => number[]) {
  const colours = [[240, 110, 20], [30, 30, 35], [200, 200, 205], [60, 110, 200], [150, 90, 60]];
  const pixels = new Uint8Array(colours.length * 400 * 3);
  for (let i = 0; i < pixels.length / 3; i++) pixels.set(grade(colours[i % colours.length]), i * 3);
  return pixels;
}
const darkerDuller = ([r, g, b]: number[]) => {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r, g, b].map((v) => Math.round((y + (v - y) * 0.6) * 0.78));
};

test("identical colors need no correction", () => {
  assert.equal(colorCorrection(scene((c) => c), scene((c) => c)), null);
});

test("a darker, duller result is brightened and resaturated", () => {
  const correction = colorCorrection(scene((c) => c), scene(darkerDuller));
  assert.ok(correction);
  assert.ok(correction.saturation > 1.3, `saturation ${correction.saturation}`);
  assert.ok(correction.gain * 128 + correction.offset > 140, "mid tones get brighter");
});

test("corrections stay within safe limits", () => {
  const black = scene(() => [2, 2, 2]);
  const correction = colorCorrection(scene((c) => c), black);
  assert.ok(correction);
  assert.ok(correction.offset <= 50 && correction.gain <= 1.35);
});

test("the filter escapes commas for ffmpeg", () => {
  assert.match(correctionFilter({ gain: 1.1, offset: 20, saturation: 1.5, hue: 5 }), /^format=yuv420p,lutyuv=y=clip\(.*\\,16\\,235\),hue=h=5\.00:s=1\.5000$/);
});

test("only scene-keeping models are color matched", () => {
  assert.deepEqual(VIDEO_MODELS.filter((m) => m.matchColors).map((m) => m.id), ["genjutsu-motion", "genjutsu-object"]);
  assert.ok(!getVideoModel("seedance-2.5-edit").matchColors);
});

test("matching a regraded video restores the original look", { skip: !ffmpeg, timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "reelform-color-"));
  try {
    const make = (name: string, filter: string) => {
      const run = spawnSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=12:duration=3",
        "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, name)]);
      assert.equal(run.status, 0, run.stderr.toString());
    };
    make("source.mp4", "null");
    make("result.mp4", "eq=brightness=-0.08:saturation=0.6");
    const mean = (pixels: Buffer) => pixels.reduce((sum, v) => sum + v, 0) / pixels.length;
    const source = mean(await sampleColors(ffmpeg!, join(dir, "source.mp4")));
    const before = mean(await sampleColors(ffmpeg!, join(dir, "result.mp4")));
    assert.ok(await matchColors(ffmpeg!, join(dir, "result.mp4"), join(dir, "source.mp4"), join(dir, "fixed.mp4")));
    const after = mean(await sampleColors(ffmpeg!, join(dir, "fixed.mp4")));
    assert.ok(Math.abs(after - source) < Math.abs(before - source) / 3, `source ${source}, before ${before}, after ${after}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
