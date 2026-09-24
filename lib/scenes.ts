export type Scene = {
  id: string;
  title: string;
  shortLabel: string;
  category: string;
  location: string;
  video: string;
  poster: string;
  prompt: string;
};

export const scenes: Scene[] = [
  {
    id: "arrival",
    shortLabel: "Automotive concept",
    title: "A cinematic arrival",
    category: "Automotive & styling",
    location: "Beverly Hills, California",
    video: "/media/arrival.mp4",
    poster: "/media/arrival.jpg",
    prompt:
      "Keep my face and movement. Dress me in a tailored charcoal suit, replace my car with a white Lamborghini Aventador SVJ, and put me in a palm-lined Beverly Hills driveway at golden hour.",
  },
  {
    id: "escape",
    shortLabel: "Coastal escape",
    title: "Out of office. On the coast.",
    category: "A change of scenery",
    location: "Amalfi Coast, Italy",
    video: "/media/escape.mp4",
    poster: "/media/escape.jpg",
    prompt:
      "Keep my identity and natural movement. Put me on a luxury yacht on the Amalfi Coast, wearing a white linen outfit. Add turquoise water, Italian villas, and warm afternoon sunshine.",
  },
  {
    id: "yacht",
    shortLabel: "Yacht days",
    title: "Nothing on the itinerary",
    category: "Travel & hospitality",
    location: "Saint-Tropez, France",
    video: "/media/yacht.mp4",
    poster: "/media/yacht.jpg",
    prompt:
      "Keep my face and natural movement. Dress me in cream linen and sunglasses, and put me on the teak deck of a private superyacht off Saint-Tropez. Add Mediterranean blue water and warm afternoon sunlight. Make it look like a candid luxury holiday video.",
  },
  {
    id: "resort",
    title: "Check in. Switch off.",
    shortLabel: "Five-star escape",
    category: "Hospitality concept",
    location: "The Maldives",
    video: "/media/resort.mp4",
    poster: "/media/resort.jpg",
    prompt:
      "Preserve my identity and movement. Put me in an ivory linen resort outfit on the terrace of a private overwater villa in the Maldives. Add a plunge pool, turquoise lagoon, and natural tropical sunlight. Keep everything photorealistic.",
  },
  {
    id: "mansion",
    title: "An architectural setting",
    shortLabel: "Architecture concept",
    category: "A different kind of home",
    location: "Beverly Hills, California",
    video: "/media/mansion.mp4",
    poster: "/media/mansion.jpg",
    prompt:
      "Keep my face and movement. Dress me in a relaxed tailored suit and turn my entrance into the front door of a modern Beverly Hills mansion. Add travertine floors, double-height glass walls, olive trees, and a sports car in the driveway. Use realistic golden-hour lighting.",
  },
  {
    id: "supercar",
    title: "A different vehicle in the shot",
    shortLabel: "Vehicle concept",
    category: "Automotive concept",
    location: "Monte Carlo, Monaco",
    video: "/media/supercar.mp4",
    poster: "/media/supercar.jpg",
    prompt:
      "Preserve my face and action. Put me in a fitted black suit and replace my car with an emerald Lamborghini Aventador SVJ outside an elegant Monaco hotel. Show the scissor door opening naturally. Keep the car geometry stable and the lighting and reflections realistic.",
  },
  {
    id: "villa",
    title: "Summer, on your terms",
    shortLabel: "Italian summer",
    category: "Travel concept",
    location: "Positano, Italy",
    video: "/media/villa.mp4",
    poster: "/media/villa.jpg",
    prompt:
      "Keep my identity and natural movement. Dress me in white summer linen and put me on a private Positano villa terrace beside an infinity pool. Add bougainvillea, pastel Italian villas, a deep blue sea, and warm sunset light. Make it feel like a real luxury vacation reel.",
  },
];
