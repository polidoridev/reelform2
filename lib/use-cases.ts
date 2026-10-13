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
  referenceCount?: number;
  posterWidth?: number;
  posterHeight?: number;
};

export const useCases: readonly UseCase[] = [
  {
    id: "seaside-character-swap",
    audience: "Ready-to-use preset",
    title: "Recast the seaside scene.",
    shortLabel: "Seaside character swap",
    model: "genjutsu-motion",
    description: "Use two reference photos to replace the man and woman in this seaside clip, carrying over each reference person’s face, hairstyle, body shape, and proportions.",
    prompt: "Replace the man with the person in reference photo 1 and the woman with the person in reference photo 2. Take each person's face, skin, head shape, hairstyle, neck, body shape and proportions from their own reference photo.",
    sourceVideo: "/media/presets/seaside-character-swap.mp4",
    poster: "/media/presets/seaside-character-swap.jpg",
    posterWidth: 1280,
    posterHeight: 960,
    referenceCount: 2,
    referenceHint: "Add two reference photos in order: photo 1 replaces the man; photo 2 replaces the woman. Each character takes their appearance and proportions from their own reference photo.",
  },
  {
    id: "car-crew-swap",
    audience: "Ready-to-use preset",
    title: "Give the car crew a new cast.",
    shortLabel: "Car crew swap",
    model: "genjutsu-motion",
    description: "Recast this car performance with three character photos: the man in the orange shirt, the man in the red cap, and the man in the striped shirt.",
    prompt: "Replace the man in the orange shirt in the front seat with @image1, replace the man in the red cap and green jacket in the back seat with @image2, and replace the man in the pink-and-navy striped shirt in the back seat with @image3. Only swap the characters. Keep each replacement consistent across every camera cut. Preserve the original movements, gestures, facial expressions, timing, camera movements, car interior, and background.",
    sourceVideo: "/media/presets/car-crew-swap.mp4",
    poster: "/media/presets/car-crew-swap.jpg",
    referenceCount: 3,
    referenceHint: "Add three reference images: @image1 replaces the man in the orange shirt; @image2 replaces the man in the red cap; @image3 replaces the man in the striped shirt. Keep the original movements and the same character mapping across camera cuts.",
  },
  {
    id: "trio-character-swap",
    audience: "Ready-to-use preset",
    title: "Recast all three characters.",
    shortLabel: "Trio character swap",
    model: "genjutsu-motion",
    description: "Use this clip with three character photos: the first guy, the guy holding the camera, and the guy coming out of the car. Keep their original movements.",
    prompt: "Replace the first guy with @image1 replace the guy holding the camera with @image2 and replace the guy coming out the car with @image3. The characters are just swapping, movements should stay the same.",
    sourceVideo: "/media/presets/trio-character-swap.mp4",
    poster: "/media/presets/trio-character-swap.jpg",
    posterWidth: 720,
    posterHeight: 1280,
    referenceCount: 3,
    referenceHint: "Add three reference images: @image1 replaces the first guy; @image2 replaces the guy holding the camera; @image3 replaces the guy coming out of the car. Keep the original movements.",
  },
  {
    id: "duo-character-swap",
    referenceCount: 2,
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
