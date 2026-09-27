// Prompts can point at attachments with @video and @image1, @image2, … in the
// order the photos were added. Providers receive the same files in that order.
export type PromptReference = { token: string; kind: "video" | "image"; index: number; start: number; end: number };

// Not preceded by a word character, so email addresses and handles are left alone.
const PATTERN = /(?<![\w@])@(video|image(\d+))\b/gi;

export function findReferences(prompt: string): PromptReference[] {
  return Array.from(prompt.matchAll(PATTERN), (match) => ({
    token: match[0].toLowerCase(),
    kind: match[1].toLowerCase() === "video" ? "video" : "image",
    index: match[2] ? Number(match[2]) : 0,
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function referenceProblem(prompt: string, imageCount: number): string | null {
  const missing = findReferences(prompt).find((ref) => ref.kind === "image" && (ref.index < 1 || ref.index > imageCount));
  if (!missing) return null;
  if (missing.index < 1) return "Photos are numbered from @image1.";
  return imageCount
    ? `${missing.token} doesn’t match a photo. You’ve added ${imageCount}, so use @image1${imageCount > 1 ? `–@image${imageCount}` : ""}.`
    : `${missing.token} doesn’t match a photo. Add a reference photo or remove the mention.`;
}

// Plain wording works with every model's text encoder; the provider receives the
// files in the same order, so "reference image 2" is the second image URL.
export function resolvePromptReferences(prompt: string, imageCount: number) {
  const problem = referenceProblem(prompt, imageCount);
  if (problem) throw new Error(problem);
  return prompt.replace(PATTERN, (_, _name: string, index?: string) =>
    !index ? "the input video" : imageCount === 1 ? "the reference image" : `reference image ${Number(index)}`,
  );
}

// After photo `removed` (1-based) is deleted, later photos move up one place. Mentions of
// the removed photo are left as they are, so the prompt shows that one needs attention.
export function renumberAfterRemoval(prompt: string, removed: number) {
  return prompt.replace(PATTERN, (token: string, _name: string, index?: string) =>
    index && Number(index) > removed ? `@image${Number(index) - 1}` : token,
  );
}
