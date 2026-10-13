import test from "node:test";
import assert from "node:assert/strict";
import { auraAiRequestSchema, compileAuraAiPlan, type AuraAiPlan, type AuraAiRequest } from "../lib/aura-ai";
import { auraAiBody, parseAuraAiResponse, requestAuraAiPlan } from "../lib/aura-ai-server";
import { estimateAuraBeat } from "../lib/aura-beats";
import { readJson } from "../lib/http";

const plan: AuraAiPlan = { summary: "A slow opening, then quick cuts.", shots: [
  { source: 0, sourceStart: 0, sourceEnd: 2, beats: 8, style: "midnight" },
  { source: 1, sourceStart: 1, sourceEnd: 2, beats: 4, style: "velocity" },
  { source: 0, sourceStart: 2, sourceEnd: 3, beats: 4, style: "clean" },
] };
const input: AuraAiRequest = { prompt: "Start slow then cut faster", settings: { seconds: 8, bpm: 120, style: "velocity" }, clips: [0, 1].map(() => ({ duration: 4, start: 0, frames: [0.5, 2, 3.5].map(time => ({ time, image: "data:image/jpeg;base64,/9j/AAAA" })) })) };
const response = (value: unknown) => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });

test("AI cut timing compiles into the exact export duration and per-shot treatments", () => {
  const shots = compileAuraAiPlan(plan, input.clips, input.settings);
  assert.deepEqual(shots.map(shot => [shot.startFrame, shot.frames, shot.source, shot.style]), [[0, 120, 0, "midnight"], [120, 60, 1, "velocity"], [180, 60, 0, "clean"]]);
});
test("untrusted plans cannot escape source bounds or create partial/extra timelines", () => {
  for (const patch of [{ source: 7 }, { sourceStart: -1 }, { sourceEnd: 4.5 }, { sourceEnd: 0.01 }, { beats: 0 }, { style: "execute-code" }])
    assert.throws(() => compileAuraAiPlan({ ...plan, shots: [{ ...plan.shots[0], ...patch }, ...plan.shots.slice(1)] }, input.clips, input.settings));
  assert.throws(() => compileAuraAiPlan({ ...plan, shots: plan.shots.slice(0, 1) }, input.clips, input.settings));
  assert.throws(() => compileAuraAiPlan({ ...plan, shots: [...plan.shots, plan.shots[0]] }, input.clips, input.settings));
  assert.throws(() => compileAuraAiPlan(plan, [{ duration: 4, start: 1 }, input.clips[1]], input.settings));
});
test("only bounded JPEG samples are accepted; arbitrary provider URLs are rejected", () => {
  assert(auraAiRequestSchema.safeParse(input).success);
  const bad = structuredClone(input); bad.clips[0].frames[0].image = "https://private.example/frame.jpg";
  assert(!auraAiRequestSchema.safeParse(bad).success);
  bad.clips[0].frames[0].image = "data:image/jpeg;base64," + "A".repeat(65000);
  assert(!auraAiRequestSchema.safeParse(bad).success);
});
test("OpenAI request uses structured output, no response storage, and bounded image detail", () => {
  const body = auraAiBody({ ...input, previousPlan: plan });
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.max_output_tokens, 6000);
  assert.equal(body.input[0].content.filter(part => part.type === "input_image").length, 6);
  assert(body.input[0].content.filter(part => part.type === "input_image").every(part => part.detail === "low"));
  assert.match(body.input[0].content[0].type === "input_text" ? body.input[0].content[0].text : "", /previousPlan/);
});
test("refusals, incomplete responses, and malformed plans fail without applying output", () => {
  assert.deepEqual(parseAuraAiResponse(response(plan), input), plan);
  for (const value of [null, { status: "incomplete" }, { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }, response({ ...plan, shots: [] })])
    assert.throws(() => parseAuraAiResponse(value, input));
});
test("provider transport makes a single request and never reflects its error details", async () => {
  let calls = 0;
  const mock: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/responses"); assert.equal(init?.method, "POST");
    return Response.json(response(plan));
  };
  assert.deepEqual(await requestAuraAiPlan(input, new AbortController().signal, mock), plan);
  assert.equal(calls, 1);
  const rejected: typeof fetch = async () => Response.json({ error: "sensitive provider details" }, { status: 401 });
  await assert.rejects(() => requestAuraAiPlan(input, new AbortController().signal, rejected), error => error instanceof Error && !error.message.includes("sensitive"));
});
test("request reader enforces byte limits even without a Content-Length header", async () => {
  const request = new Request("http://localhost/api/aura/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: "a".repeat(100) }) });
  await assert.rejects(() => readJson(request, 50));
});
test("local beat analysis finds a steady 120 BPM pulse and rejects silence", () => {
  const rate = 1000, data = new Float32Array(rate * 12);
  for (let i = 250; i < data.length; i += 500) for (let j = 0; j < 35; j++) data[i + j] = Math.exp(-j / 8);
  const buffer = { sampleRate: rate, length: data.length, getChannelData: () => data };
  const beat = estimateAuraBeat(buffer);
  assert(beat && Math.abs(beat.bpm - 120) <= 1, JSON.stringify(beat));
  assert(Math.abs(beat.offset - 0.25) < 0.03);
  data.fill(0); assert.equal(estimateAuraBeat(buffer), null);
});
