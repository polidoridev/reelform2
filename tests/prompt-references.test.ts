import test from "node:test";
import assert from "node:assert/strict";
import { findReferences, referenceProblem, renumberAfterRemoval, resolvePromptReferences } from "../lib/prompt-references";

test("finds @video and numbered @image mentions, ignoring emails and longer words", () => {
  const refs = findReferences("Use @video and @IMAGE12, not me@image1.com, @videos or @@image2");
  assert.deepEqual(refs.map((r) => [r.token, r.kind, r.index]), [["@video", "video", 0], ["@image12", "image", 12]]);
});

test("reports mentions that don't match an attached photo", () => {
  assert.equal(referenceProblem("Swap @video for @image1", 1), null);
  assert.match(referenceProblem("Swap for @image3", 2)!, /@image3 doesn’t match a photo. You’ve added 2, so use @image1–@image2/);
  assert.match(referenceProblem("Swap for @image1", 0)!, /Add a reference photo/);
  assert.match(referenceProblem("Swap for @image0", 3)!, /numbered from @image1/);
  assert.throws(() => resolvePromptReferences("Swap for @image2", 1), /doesn’t match/);
});

test("removing a photo shifts later mentions up and leaves the removed one", () => {
  assert.equal(renumberAfterRemoval("@image1 then @image2 then @image3 in @video", 2), "@image1 then @image2 then @image2 in @video");
});

test("@video is only valid when a video is attached", () => {
  assert.equal(referenceProblem("Restyle @video", 0, true), null);
  assert.match(referenceProblem("Restyle @video", 0, false)!, /@video doesn’t match a video/);
  assert.equal(resolvePromptReferences("A dog like @image1 on a beach", 1, false), "A dog like the reference image on a beach");
});
