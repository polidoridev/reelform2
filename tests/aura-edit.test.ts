import test from "node:test";
import assert from "node:assert/strict";
import { AURA_FPS, AURA_STYLES, auraSourceProgress, planAura, type AuraSettings } from "../lib/aura-edit";

const settings: AuraSettings = { style: "velocity", bpm: 140, seconds: 12, shape: "9:16", fit: "cover", music: "night-drive", musicOffset: 0 };
test("all styles produce contiguous, frame-exact edits with beat-aligned cuts", () => {
  for (const style of AURA_STYLES) for (const bpm of [60, 123, 140, 200]) {
    const shots = planAura([{ start: 0, duration: 7 }, { start: 1, duration: 5 }], { ...settings, style: style.id, bpm });
    let cursor = 0;
    shots.forEach((shot, index) => {
      assert.equal(shot.startFrame, cursor);
      assert.equal(shot.source, index % 2);
      assert(Math.abs(shot.startFrame / AURA_FPS - index * 60 / bpm * style.beats) <= 0.5 / AURA_FPS + 1e-9);
      cursor += shot.frames;
    });
    assert.equal(cursor, settings.seconds * AURA_FPS);
  }
});
test("short clips and late start points never request frames outside the source", () => {
  const sources = [{ start: 0, duration: 0.5 }, { start: 119.5, duration: 120 }];
  for (const style of AURA_STYLES) {
    for (const shot of planAura(sources, { ...settings, style: style.id, seconds: 30 })) {
      assert(shot.sourceStart >= sources[shot.source].start);
      assert(shot.sourceStart + shot.sourceSpan < sources[shot.source].duration);
      for (let frame = 0; frame < shot.frames; frame++) {
        const position = shot.sourceStart + auraSourceProgress(style.id, frame / shot.frames) * shot.sourceSpan;
        assert(position >= 0 && position < sources[shot.source].duration);
      }
    }
  }
});
test("velocity slows down while its source sampling stays continuous and monotonic", () => {
  const samples = Array.from({ length: 101 }, (_, i) => auraSourceProgress("velocity", i / 100));
  assert.equal(samples[0], 0); assert.equal(samples[100], 1);
  assert(samples.every((value, i) => i === 0 || value > samples[i - 1]));
  assert(samples[1] - samples[0] > samples[100] - samples[99]);
});
test("bad durations, offsets, counts, and tempo are rejected before export", () => {
  for (const bpm of [0, NaN, Infinity, 201]) assert.throws(() => planAura([{ start: 0, duration: 4 }], { ...settings, bpm }));
  for (const seconds of [NaN, 0, 31]) assert.throws(() => planAura([{ start: 0, duration: 4 }], { ...settings, seconds }));
  for (const sources of [[], [{ start: -1, duration: 4 }], [{ start: NaN, duration: 4 }], [{ start: 3.8, duration: 4 }], Array(9).fill({ start: 0, duration: 4 })]) assert.throws(() => planAura(sources, settings));
});
