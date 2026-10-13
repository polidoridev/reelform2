import { z } from "zod";
import { AURA_FPS, type AuraSettings, type AuraShot, type AuraSource } from "./aura-edit";

const style = z.enum(["velocity", "midnight", "clean"]);
export const auraAiPlanSchema = z.object({
  summary: z.string().min(1).max(600),
  shots: z.array(z.object({
    source: z.number().int().min(0).max(7),
    sourceStart: z.number().finite().min(0).max(120),
    sourceEnd: z.number().finite().min(0).max(120),
    beats: z.number().finite().min(0.5).max(8),
    style,
  }).strict()).min(1).max(64),
}).strict();
export type AuraAiPlan = z.infer<typeof auraAiPlanSchema>;

export const auraAiRequestSchema = z.object({
  prompt: z.string().trim().min(5).max(1500),
  settings: z.object({ seconds: z.number().min(4).max(30), bpm: z.number().min(60).max(200), style }).strict(),
  clips: z.array(z.object({
    duration: z.number().min(0.5).max(120),
    start: z.number().min(0).max(119.5),
    frames: z.array(z.object({
      time: z.number().min(0).max(120),
      image: z.string().max(65000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
    }).strict()).length(3),
  }).strict()).min(1).max(8),
  previousPlan: auraAiPlanSchema.optional(),
}).strict().superRefine((data, ctx) => {
  data.clips.forEach((clip, index) => {
    if (clip.start > clip.duration - 0.5 || clip.frames.some(frame => frame.time < clip.start || frame.time >= clip.duration))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid clip timing.", path: ["clips", index] });
  });
});
export type AuraAiRequest = z.infer<typeof auraAiRequestSchema>;

// A schema-valid response still needs media bounds and timeline validation.
// Never execute model-produced code or trust its timestamps at render time.
export function compileAuraAiPlan(value: unknown, sources: AuraSource[], settings: Pick<AuraSettings, "seconds" | "bpm">): AuraShot[] {
  const plan = auraAiPlanSchema.parse(value);
  const total = Math.round(settings.seconds * AURA_FPS);
  if (!Number.isFinite(settings.bpm) || settings.bpm < 60 || settings.bpm > 200 || total < 120 || total > 900)
    throw new Error("Invalid edit timing.");
  let beats = 0;
  const shots = plan.shots.map(shot => {
    const source = sources[shot.source];
    if (!source || shot.sourceStart < source.start || shot.sourceEnd > source.duration - 0.01 || shot.sourceEnd - shot.sourceStart < 0.05)
      throw new Error("The AI selected a moment outside your footage. Try another plan.");
    const startFrame = Math.round(beats * 60 / settings.bpm * AURA_FPS);
    beats += shot.beats;
    const endFrame = Math.min(total, Math.round(beats * 60 / settings.bpm * AURA_FPS));
    if (endFrame <= startFrame) throw new Error("The AI added shots beyond the end of the edit. Try another plan.");
    return { source: shot.source, sourceStart: shot.sourceStart, sourceSpan: shot.sourceEnd - shot.sourceStart, startFrame, frames: endFrame - startFrame, style: shot.style };
  });
  if (shots.reduce((sum, shot) => sum + shot.frames, 0) !== total)
    throw new Error("The AI plan did not cover the full edit. Try another plan.");
  return shots;
}

// Kept explicit so the REST integration does not require a new SDK dependency.
export const auraAiOutputSchema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string", maxLength: 600 },
    shots: { type: "array", minItems: 1, maxItems: 64, items: {
      type: "object", additionalProperties: false,
      properties: {
        source: { type: "integer", minimum: 0, maximum: 7 },
        sourceStart: { type: "number", minimum: 0, maximum: 120 },
        sourceEnd: { type: "number", minimum: 0, maximum: 120 },
        beats: { type: "number", minimum: 0.5, maximum: 8 },
        style: { type: "string", enum: ["velocity", "midnight", "clean"] },
      }, required: ["source", "sourceStart", "sourceEnd", "beats", "style"],
    } },
  }, required: ["summary", "shots"],
};
