import Studio from "@/components/reelform/studio";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "CinemaLab",
  description: "Direct your next scene with camera, lens and cinematic look controls. Plan a sequence, add references, and generate each shot with Reelform.",
  path: "/cinemalab",
  index: false,
});

export default function CinemaLabPage() {
  return <Studio cinema />;
}
