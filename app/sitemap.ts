import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "@/lib/site-url";
import { admin } from "@/lib/supabase/server";

export const revalidate = 3600;

const pages: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/community", priority: 0.7, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = pages.map((page) => ({
    url: `${CANONICAL_ORIGIN}${page.path === "/" ? "" : page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
  // Public community posts. A database outage still serves the static pages.
  try {
    const { data } = await admin()
      .from("rf_community_posts")
      .select("id,published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1000);
    for (const post of data ?? [])
      entries.push({
        url: `${CANONICAL_ORIGIN}/community/${post.id}`,
        lastModified: post.published_at ?? undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      });
  } catch {
    /* Static pages only. */
  }
  return entries;
}
