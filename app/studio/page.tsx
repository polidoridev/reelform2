import { pageMetadata } from "@/lib/seo";
import Studio from "@/components/reelform/studio";
export const metadata = pageMetadata({
  title: "Motion Transfer studio",
  description: "Transfer your video’s movement to a character with Genjutsu. Upload a clip, add reference photos, and review the exact credit cost.",
  path: "/studio",
  index: false,
});
export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // A link to another saved chat must replace the current studio state.
  const key = typeof params.generation === "string" ? params.generation : typeof params.request === "string" ? params.request : typeof params.useCase === "string" ? params.useCase : params.trial === "1" ? "trial" : "new";
  return <Studio key={key} />;
}
