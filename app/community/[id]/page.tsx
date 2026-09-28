import type { Metadata } from "next";
import { z } from "zod";
import { CommunityGallery } from "@/components/reelform/community";
import { admin } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/seo";

// Shared post links get the post's own title and caption in search results and previews.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const path = `/community/${id}`;
  const fallback = pageMetadata({ title: "A creator’s moment", description: "A video shared by a Reelform creator.", path });
  if (!z.string().uuid().safeParse(id).success) return { ...fallback, robots: { index: false, follow: true } };
  try {
    const { data } = await admin()
      .from("rf_community_posts")
      .select("title,creator,caption")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (!data) return { ...fallback, robots: { index: false, follow: true } };
    const title = String(data.title || "A creator’s moment").slice(0, 70);
    const by = data.creator ? ` by ${String(data.creator).slice(0, 40)}` : "";
    const description = (String(data.caption || "") || `An AI-assisted video${by}, shared on the Reelform community.`).slice(0, 160);
    return pageMetadata({ title: `${title}${by}`, description, path });
  } catch {
    return fallback;
  }
}
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CommunityGallery postId={(await params).id} />;
}
