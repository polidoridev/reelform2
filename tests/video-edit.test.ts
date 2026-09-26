import test from "node:test";
import assert from "node:assert/strict";
import { createEdit, editDuration, isUnchanged, locate, moveClip, removeClip, splitAt, trimClip, MIN_CLIP_SECONDS } from "../lib/video-edit";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("a new edit covers the whole source and is unchanged", () => {
  const edit = createEdit(12);
  close(editDuration(edit), 12);
  assert.ok(isUnchanged(edit, 12));
  assert.ok(!isUnchanged({ ...edit, muted: true }, 12));
});

test("splitting, deleting and reordering produce the expected timeline", () => {
  const split = splitAt(splitAt(createEdit(10), 4), 7);
  assert.deepEqual(split.clips.map((c) => [c.start, c.end]), [[0, 4], [4, 7], [7, 10]]);
  assert.equal(new Set(split.clips.map((c) => c.id)).size, 3);
  const cut = removeClip(split, split.clips[1].id);
  close(editDuration(cut), 7);
  // Timeline 5s now falls in the last part, 1s after its source start of 7s.
  const hit = locate(cut, 5)!;
  assert.equal(hit.index, 1);
  close(hit.source, 8);
  const moved = moveClip(cut, cut.clips[1].id, -1);
  assert.deepEqual(moved.clips.map((c) => c.start), [7, 0]);
  assert.equal(moveClip(moved, moved.clips[0].id, -1), moved);
  assert.ok(!isUnchanged(cut, 10));
});

test("splits too close to a cut and deleting the last part are ignored", () => {
  const edit = createEdit(10);
  assert.equal(splitAt(edit, MIN_CLIP_SECONDS / 2), edit);
  assert.equal(removeClip(edit, edit.clips[0].id), edit);
  const split = splitAt(edit, 5);
  assert.equal(splitAt(split, 5 + MIN_CLIP_SECONDS / 2), split);
});

test("trimming is clamped to the source and a minimum length", () => {
  const edit = createEdit(60);
  const id = edit.clips[0].id;
  const trimmed = trimClip(trimClip(edit, id, "start", 20, 60), id, "end", 45, 60);
  assert.deepEqual([trimmed.clips[0].start, trimmed.clips[0].end], [20, 45]);
  close(editDuration(trimmed), 25);
  assert.equal(trimClip(trimmed, id, "start", -5, 60).clips[0].start, 0);
  assert.equal(trimClip(trimmed, id, "end", 99, 60).clips[0].end, 60);
  close(trimClip(trimmed, id, "start", 50, 60).clips[0].start, 45 - MIN_CLIP_SECONDS);
  close(trimClip(trimmed, id, "end", 0, 60).clips[0].end, 20 + MIN_CLIP_SECONDS);
});

test("the end of the timeline resolves to the last frame of the last part", () => {
  const edit = splitAt(createEdit(8), 3);
  const hit = locate(edit, 8)!;
  assert.equal(hit.index, 1);
  close(hit.source, 8);
  close(locate(edit, -1)!.source, 0);
});
