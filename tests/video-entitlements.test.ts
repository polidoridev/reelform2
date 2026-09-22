import test from "node:test";
import assert from "node:assert/strict";
import { videoEntitlements, validateVideoEntitlements } from "../lib/commerce/entitlements";
import { getVideoModel, modelRequest } from "../lib/video-models";
const now = Date.parse("2026-09-21T12:00:00Z");
const paid_until = "2026-10-21T12:00:00Z";
const input = { resolution: "720p", duration: 10, imageCount: 1, generateAudio: false };
const plan = (id: string) => videoEntitlements({ plan: id, paid_until }, false, now);

test("Starter gates each premium feature separately", () => {
  assert.doesNotThrow(() => validateVideoEntitlements(plan("starter"), input));
  for (const change of [{resolution:"1080p"}, {duration:11}, {imageCount:2}, {generateAudio:true}])
    assert.throws(() => validateVideoEntitlements(plan("starter"), {...input, ...change}), /upgrade/i);
});
test("Pro unlocks Full HD and audio; Studio adds longer clips and more references", () => {
  const pro = {...input, resolution:"1080p", duration:20, imageCount:2, generateAudio:true};
  assert.doesNotThrow(() => validateVideoEntitlements(plan("pro"), pro));
  assert.throws(() => validateVideoEntitlements(plan("pro"), {...pro, duration:21}), /20 seconds/);
  assert.throws(() => validateVideoEntitlements(plan("pro"), {...pro, imageCount:3}), /2 reference/);
  assert.doesNotThrow(() => validateVideoEntitlements(plan("studio"), {...pro, duration:30, imageCount:4}));
});
test("expired and unknown plans fall back; paid terms and trusted admin keep benefits", () => {
  assert.equal(videoEntitlements({plan:"studio", paid_until:"2026-09-21T12:00:00Z"}, false, now).id, "starter");
  assert.equal(videoEntitlements({plan:"pro", paid_until}, false, now).id, "pro");
  assert.equal(plan("forged").id, "starter");
  assert.equal(videoEntitlements(null, true, now).id, "studio");
  assert.equal(videoEntitlements(null, false, now).id, "starter");
});
test("Full HD entitlement still respects provider capabilities and selects pro mode", () => {
  const request = {prompt:"A cinematic scene",videoUrl:"https://example.com/video.mp4",imageUrls:[],resolution:"1080p",generateAudio:false,media:{duration:10,width:1920,height:1080}};
  validateVideoEntitlements(plan("pro"), {...input, resolution:"1080p"});
  assert.throws(() => modelRequest(getVideoModel("seedance-2.5-edit"), request), /does not support/);
  assert.equal(modelRequest(getVideoModel("kling-o3-edit"), request).mode, "pro");
});
