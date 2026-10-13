import { pageMetadata } from "@/lib/seo";
import Studio from "@/components/reelform/studio";
export const metadata = pageMetadata({
  title: "Video studio",
  description: "Upload a clip, trim it, add reference photos, and tell Reelform what to change.",
  path: "/studio",
  index: false,
});
export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A link to another saved chat must replace the current studio state.
  const key = typeof params.generation === "string" ? params.generation : typeof params.request === "string" ? params.request : "new";
  return <Studio key={key} />;
}
