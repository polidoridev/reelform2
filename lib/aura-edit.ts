export const AURA_STYLES = [
  { id: "velocity", name: "Velocity", description: "Fast entries. Slow holds. A punch on every cut.", beats: 2, filter: "contrast(1.2) saturate(0.85)" },
  { id: "midnight", name: "Midnight", description: "Longer holds, deep shadows, and a slow push in.", beats: 4, filter: "contrast(1.25) saturate(0.55) brightness(0.86)" },
  { id: "clean", name: "Clean cut", description: "Quick cuts, natural color, and a little movement.", beats: 1, filter: "contrast(1.06) saturate(1.08)" },
] as const;
export type AuraStyle = (typeof AURA_STYLES)[number]["id"];
export const AURA_TRACKS = [
  { id: "night-drive", name: "Night drive", bpm: 140, description: "Deep bass · metallic lead" },
  { id: "after-hours", name: "After hours", bpm: 120, description: "Low pulse · spacious melody" },
  { id: "redline", name: "Redline", bpm: 160, description: "Fast drums · distorted bass" },
] as const;
export type AuraTrack = (typeof AURA_TRACKS)[number]["id"];
export type AuraSource = { duration: number; start: number };
export type AuraSettings = {
  style: AuraStyle;
  bpm: number;
  seconds: number;
  shape: "9:16" | "16:9" | "1:1";
  fit: "cover" | "contain";
  music: AuraTrack | "upload";
  musicOffset: number;
};
export type AuraShot = { source: number; startFrame: number; frames: number; sourceStart: number; sourceSpan: number; style?: AuraStyle };
export const AURA_FPS = 30;
export const MAX_AURA_FILES = 8;
export const MAX_AURA_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_AURA_TOTAL_BYTES = 400 * 1024 * 1024;

// Integrated speed curve: Velocity starts fast and settles into a slow hold.
// Normalizing the integral keeps every sample inside the selected source span.
export function auraSourceProgress(style: AuraStyle, progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  return style === "velocity" ? (0.45 * p + 0.8 * (1 - (1 - p) ** 3)) / 1.25 : p;
}

export function planAura(sources: AuraSource[], settings: AuraSettings): AuraShot[] {
  const style = AURA_STYLES.find(item => item.id === settings.style);
  if (!style || !Number.isFinite(settings.bpm) || settings.bpm < 60 || settings.bpm > 200 ||
    !Number.isFinite(settings.seconds) || settings.seconds < 4 || settings.seconds > 30)
    throw new Error("Choose a style, a tempo from 60–200 BPM, and a length from 4–30 seconds.");
  if (!sources.length || sources.length > MAX_AURA_FILES || sources.some(source =>
    !Number.isFinite(source.duration) || source.duration < 0.5 || source.duration > 120 ||
    !Number.isFinite(source.start) || source.start < 0 || source.start > source.duration - 0.5))
    throw new Error("Add 1–8 clips, each 0.5–120 seconds long, with at least half a second after its start point.");
  const totalFrames = Math.round(settings.seconds * AURA_FPS);
  const framesPerShot = 60 / settings.bpm * style.beats * AURA_FPS;
  const count = Math.ceil(totalFrames / framesPerShot);
  const shots: AuraShot[] = [];
  for (let index = 0; index < count; index++) {
    const startFrame = Math.round(index * framesPerShot);
    const endFrame = Math.min(totalFrames, Math.round((index + 1) * framesPerShot));
    if (endFrame <= startFrame) continue;
    const sourceIndex = index % sources.length;
    const source = sources[sourceIndex];
    const frames = endFrame - startFrame;
    const sourceSpan = Math.min(source.duration - source.start - 0.02, frames / AURA_FPS * (style.id === "velocity" ? 1.25 : style.id === "midnight" ? 0.75 : 1));
    const uses = Math.ceil((count - sourceIndex) / sources.length);
    const pass = Math.floor(index / sources.length);
    const sourceStart = source.start + (uses > 1 ? pass / (uses - 1) * Math.max(0, source.duration - source.start - sourceSpan - 0.02) : 0);
    shots.push({ source: sourceIndex, startFrame, frames, sourceStart, sourceSpan });
  }
  return shots;
}

export function auraDimensions(shape: AuraSettings["shape"]) {
  if (shape === "9:16") return { width: 720, height: 1280 };
  if (shape === "16:9") return { width: 1280, height: 720 };
  return { width: 720, height: 720 };
}
