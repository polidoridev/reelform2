import { z } from "zod";

// Creative direction is compiled into the existing prompt, never extra provider fields.
export const CINEMA_CONTROLS = {
  framing: { label: "Framing", options: ["Director's choice", "Extreme wide shot", "Wide shot", "Medium shot", "Close-up", "Extreme close-up", "Over-the-shoulder"] },
  angle: { label: "Camera angle", options: ["Director's choice", "Eye level", "Low angle", "High angle", "Overhead", "POV", "Dutch angle"] },
  movement: { label: "Camera movement", options: ["Director's choice", "Locked-off tripod", "Slow dolly in", "Dolly out", "Orbit around subject", "Side tracking", "Crane up", "Handheld", "FPV fly-through", "Slow pan"] },
  lens: { label: "Lens feel", options: ["Director's choice", "14mm ultra-wide", "24mm wide", "35mm natural", "50mm standard", "85mm portrait", "135mm telephoto", "Anamorphic"] },
  aperture: { label: "Depth of field", options: ["Director's choice", "f/1.4 feel · very shallow", "f/2.8 feel · soft background", "f/5.6 feel · balanced", "f/11 feel · deep focus"] },
  focus: { label: "Focus", options: ["Director's choice", "Track the subject", "Rack focus foreground to background", "Rack focus background to foreground", "Keep the entire scene sharp"] },
  lighting: { label: "Lighting", options: ["Director's choice", "Golden hour", "Soft window light", "Neon night", "Moonlight", "Hard studio light", "Soft studio light", "Dramatic side light", "Overcast daylight"] },
  look: { label: "Film look", options: ["Director's choice", "Natural cinematic", "35mm film", "Vintage 16mm", "Black-and-white noir", "Documentary", "Polished commercial", "Cool shadows, warm highlights", "Muted pastel"] },
  texture: { label: "Texture", options: ["Director's choice", "Clean digital", "Subtle film grain", "Pronounced film grain", "Soft halation"] },
  atmosphere: { label: "Atmosphere", options: ["Director's choice", "Clear air", "Light haze", "Drifting fog", "Rain and wet reflections", "Floating dust in light"] },
} as const;
export type CinemaControl = keyof typeof CINEMA_CONTROLS;
export type CinemaDirection = Record<CinemaControl, string>;
export const CAMERA_CONTROLS: CinemaControl[] = ["framing", "angle", "movement", "lens", "aperture", "focus"];
export const LOOK_CONTROLS: CinemaControl[] = ["lighting", "look", "texture", "atmosphere"];
export const MAX_CINEMA_SHOTS = 8;
export const CINEMA_PROMPT_LIMIT = 2000;
export const DEFAULT_DIRECTION = Object.fromEntries(Object.keys(CINEMA_CONTROLS).map(key => [key, "Director's choice"])) as CinemaDirection;

const directionSchema = z.object({
  framing: z.string(), angle: z.string(), movement: z.string(), lens: z.string(), aperture: z.string(),
  focus: z.string(), lighting: z.string(), look: z.string(), texture: z.string(), atmosphere: z.string(),
}).refine(direction => (Object.keys(CINEMA_CONTROLS) as CinemaControl[]).every(key => (CINEMA_CONTROLS[key].options as readonly string[]).includes(direction[key])));
const shotSchema = z.object({ id: z.string().min(1).max(80), title: z.string().max(80), scene: z.string().max(1000), direction: directionSchema });
export const cinemaPlanSchema = z.object({
  version: z.literal(1),
  continuity: z.string().max(400),
  shots: z.array(shotSchema).min(1).max(MAX_CINEMA_SHOTS).refine(shots => new Set(shots.map(shot => shot.id)).size === shots.length),
  selected: z.string().max(80),
});
export type CinemaShot = z.infer<typeof shotSchema>;
export type CinemaPlan = z.infer<typeof cinemaPlanSchema>;
export function newCinemaShot(id: string, title = "Untitled shot"): CinemaShot {
  return { id, title, scene: "", direction: { ...DEFAULT_DIRECTION } };
}
export function initialCinemaPlan(): CinemaPlan {
  return { version: 1, continuity: "", shots: [newCinemaShot("shot-1", "Opening shot")], selected: "shot-1" };
}
export function parseCinemaPlan(value: unknown): CinemaPlan | null {
  const parsed = cinemaPlanSchema.safeParse(value);
  if (!parsed.success) return null;
  const plan = parsed.data;
  return { ...plan, selected: plan.shots.some(shot => shot.id === plan.selected) ? plan.selected : plan.shots[0].id };
}
export function compileCinemaPrompt(shot: CinemaShot, continuity: string): string {
  const direction = (Object.entries(CINEMA_CONTROLS) as [CinemaControl, typeof CINEMA_CONTROLS[CinemaControl]][])
    .filter(([key]) => shot.direction[key] !== "Director's choice")
    .map(([key, control]) => `${control.label}: ${shot.direction[key]}.`);
  return [shot.scene.trim(), continuity.trim() ? `Continuity: ${continuity.trim()}` : "", direction.length ? `Creative direction:\n${direction.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

export const CINEMA_PRESETS = [
  { name: "Night exterior", direction: { lighting: "Neon night", look: "35mm film", lens: "35mm natural", movement: "Slow dolly in", atmosphere: "Rain and wet reflections" } },
  { name: "Product portrait", direction: { lighting: "Soft studio light", look: "Polished commercial", lens: "85mm portrait", framing: "Close-up", movement: "Orbit around subject", aperture: "f/2.8 feel · soft background" } },
  { name: "Quiet documentary", direction: { lighting: "Soft window light", look: "Documentary", lens: "35mm natural", movement: "Handheld", texture: "Subtle film grain" } },
  { name: "Golden landscape", direction: { lighting: "Golden hour", look: "Natural cinematic", lens: "24mm wide", framing: "Extreme wide shot", movement: "Crane up", aperture: "f/11 feel · deep focus" } },
] satisfies { name: string; direction: Partial<CinemaDirection> }[];

// An editable shot structure, intentionally not presented as an AI-generated storyboard.
export function createCinemaSequence(scene: string, direction: CinemaDirection, id: () => string): CinemaShot[] {
  return [
    { title: "Establish the scene", framing: "Wide shot", movement: "Slow dolly in", note: "Establish the location and introduce the subject." },
    { title: "Follow the action", framing: "Medium shot", movement: "Side tracking", note: "Focus on the subject's main action within the same location." },
    { title: "Find the detail", framing: "Close-up", movement: "Locked-off tripod", note: "End on a meaningful detail of the subject." },
  ].map(item => ({ id: id(), title: item.title, scene: `${scene.trim().slice(0, 850)}\n${item.note}`, direction: { ...direction, framing: item.framing, movement: item.movement } }));
}
