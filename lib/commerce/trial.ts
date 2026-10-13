export const TRIAL_MODEL = "seedance-2.5-edit";
export const TRIAL_RESOLUTION = "480p";
export type TrialStatus = {
  state: "available" | "active" | "completed" | "exhausted" | "ineligible" | "paused";
  attemptsRemaining: number;
};
export const TRIAL_PROMPTS = [
  { id: "golden-hour", shortLabel: "Golden hour", model: TRIAL_MODEL, prompt: "Give this video warm golden-hour lighting. Preserve the subject, camera movement, and scene layout." },
  { id: "snow", shortLabel: "A little snow", model: TRIAL_MODEL, prompt: "Add gently falling snow to the surroundings. Preserve the subject, movement, and camera framing." },
  { id: "cinematic", shortLabel: "Cinematic color", model: TRIAL_MODEL, prompt: "Give this video a cinematic color grade with warm highlights and cool shadows. Preserve all subjects and movement." },
];
export function validateTrialSettings(input: { model: string; resolution: string; duration: number; imageCount: number; generateAudio: boolean; hasVideo: boolean }, cost?: number) {
  if (input.model !== TRIAL_MODEL || input.resolution !== TRIAL_RESOLUTION || !input.hasVideo ||
    !Number.isFinite(input.duration) || input.duration < 4 || input.duration > 5 || input.imageCount > 1 || input.generateAudio)
    throw new Error("Your free transformation uses Seedance 2.5 Edit at 480p: upload a 4–5 second clip, with up to one reference photo and original audio.");
  if (cost !== undefined && (!Number.isFinite(cost) || cost <= 0 || cost > 1.30))
    throw new Error("This clip exceeds the free transformation limit. Try a shorter clip.");
}
export function trialMessage(state: TrialStatus["state"]) {
  switch (state) {
    case "available": return "Your first transformation is free. Use a 4–5 second clip at 480p. No credit card needed.";
    case "active": return "Your free transformation is processing. Check My creations before trying again.";
    case "completed": return "Like your result?";
    case "exhausted": return "Your free trial’s three attempts have been used. Contact support if you couldn’t get a result.";
    case "paused": return "The free transformation pilot is currently full or paused.";
    default: return "The free transformation is available to eligible new accounts, once per person.";
  }
}
