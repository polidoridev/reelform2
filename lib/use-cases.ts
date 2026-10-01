export type UseCase = {
  id: string;
  audience: string;
  title: string;
  shortLabel: string;
  model: string;
  description: string;
  prompt: string;
  sourceVideo?: string;
  poster?: string;
  referenceHint?: string;
};

export const useCases: readonly UseCase[] = [
  {
    id: "duo-character-swap",
    audience: "Ready-to-use preset",
    title: "Give this duo a new cast.",
    shortLabel: "Duo character swap",
    model: "genjutsu-motion",
    description: "Use this performance clip with two character photos. Photo 1 replaces the guy on the right; photo 2 replaces the guy on the left.",
    prompt: "Replace the guy on the right (@image1) and replace the guy on the left with (@image2). Just swap the characters, the movements should stay the same.",
    sourceVideo: "/media/presets/duo-character-swap.mp4",
    poster: "/media/presets/duo-character-swap.jpg",
    referenceHint: "Add two reference images: @image1 replaces the guy on the right; @image2 replaces the guy on the left. Keep the original movements.",
  },
  {
    id: "character-remix",
    audience: "Creators & entertainment",
    title: "Give the performance a new cast.",
    shortLabel: "Character remix",
    model: "genjutsu-motion",
    description: "Film your own performance, then recast it with an original character, a stylized version of you, or a new look. Your movement and timing carry over.",
    prompt: "Transfer the main performer’s movement in @video to the character in @image1. Follow the rhythm and gestures, with a consistent character appearance throughout the shot.",
  },
  {
    id: "construction-concept",
    audience: "Construction & renovation",
    title: "Show the idea on site.",
    shortLabel: "Site concept",
    model: "genjutsu-object",
    description: "Explore a different fixture or piece of equipment in a site clip. Make visual concepts for client conversations and social content.",
    prompt: "Replace the main fixture in @video with the fixture in @image1. Match its position, perspective, and lighting. Keep the surrounding space and camera movement as consistent as possible. Create a visual design concept.",
  },
  {
    id: "product-swap",
    audience: "Brands & small businesses",
    title: "Try a new product in the shot.",
    shortLabel: "Product swap",
    model: "genjutsu-object",
    description: "Explore another product, prop, or furniture piece using footage you already have. Build creative variations for your next campaign.",
    prompt: "Replace the main product in @video with the product in @image1. Match the original placement, scale, lighting, and shadows. Keep the camera movement and surrounding scene as consistent as possible.",
  },
  {
    id: "motion-experiment",
    audience: "Anyone with an idea",
    title: "Put your character in motion.",
    shortLabel: "Animate a character",
    model: "genjutsu-motion",
    description: "Bring a mascot, an illustration, or a character concept to a dance or performance. Start with a short clip and see where it takes you.",
    prompt: "Animate the character in @image1 using the movement in @video. Follow the main subject’s poses and timing while keeping the reference character’s look consistent.",
  },
] as const;
