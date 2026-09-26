// A non-destructive edit list over one source video. Clips reference source
// seconds and play back-to-back; nothing is rendered until the edit is applied.
export type Clip = { id: string; start: number; end: number };
export type Edit = { clips: Clip[]; muted: boolean };

export const MIN_CLIP_SECONDS = 0.25;
// Longer uploads are accepted only so they can be trimmed down in the editor.
export const MAX_EDITABLE_SECONDS = 10 * 60;

let counter = 0;
const nextId = () => `clip-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createEdit(duration: number): Edit {
  return { clips: [{ id: nextId(), start: 0, end: duration }], muted: false };
}
export const clipLength = (clip: Clip) => clip.end - clip.start;
export function editDuration(edit: Edit) {
  return edit.clips.reduce((total, clip) => total + clipLength(clip), 0);
}
// Timeline start of each clip.
export function clipOffsets(edit: Edit) {
  const offsets: number[] = [];
  let total = 0;
  for (const clip of edit.clips) {
    offsets.push(total);
    total += clipLength(clip);
  }
  return offsets;
}
// Maps a timeline position to the clip under it and the matching source time.
// The end of the timeline resolves to the end of the last clip.
export function locate(edit: Edit, time: number) {
  const offsets = clipOffsets(edit);
  for (let index = 0; index < edit.clips.length; index++) {
    const clip = edit.clips[index];
    const local = time - offsets[index];
    if (local < clipLength(clip) || index === edit.clips.length - 1)
      return { index, clip, offset: offsets[index], source: clip.start + Math.min(Math.max(local, 0), clipLength(clip)) };
  }
  return null;
}
export function splitAt(edit: Edit, time: number): Edit {
  const hit = locate(edit, time);
  if (!hit) return edit;
  const { index, clip, source } = hit;
  if (source - clip.start < MIN_CLIP_SECONDS || clip.end - source < MIN_CLIP_SECONDS) return edit;
  const clips = [...edit.clips];
  clips.splice(index, 1, { ...clip, end: source }, { id: nextId(), start: source, end: clip.end });
  return { ...edit, clips };
}
// Moves one edge of a clip to a new source time, clamped to the source and a minimum length.
export function trimClip(edit: Edit, id: string, edge: "start" | "end", source: number, sourceDuration: number): Edit {
  return {
    ...edit,
    clips: edit.clips.map((clip) => {
      if (clip.id !== id) return clip;
      return edge === "start"
        ? { ...clip, start: Math.min(Math.max(source, 0), clip.end - MIN_CLIP_SECONDS) }
        : { ...clip, end: Math.max(Math.min(source, sourceDuration), clip.start + MIN_CLIP_SECONDS) };
    }),
  };
}
export function removeClip(edit: Edit, id: string): Edit {
  if (edit.clips.length < 2) return edit;
  return { ...edit, clips: edit.clips.filter((clip) => clip.id !== id) };
}
export function moveClip(edit: Edit, id: string, direction: -1 | 1): Edit {
  const index = edit.clips.findIndex((clip) => clip.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= edit.clips.length) return edit;
  const clips = [...edit.clips];
  [clips[index], clips[target]] = [clips[target], clips[index]];
  return { ...edit, clips };
}
// True when rendering would reproduce the source, so the original file can be used as-is.
export function isUnchanged(edit: Edit, sourceDuration: number) {
  const [clip] = edit.clips;
  return !edit.muted && edit.clips.length === 1 && clip.start <= 0.01 && clip.end >= sourceDuration - 0.01;
}
