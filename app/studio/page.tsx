import { pageMetadata } from "@/lib/seo";
import Studio from "@/components/reelform/studio";
export const metadata = pageMetadata({
  title: "Video studio",
  description: "Upload a clip, trim it, add reference photos, and tell Reelform what to change.",
  path: "/studio",
  index: false,
});
export default function StudioPage() {
  return <Studio />;
}
