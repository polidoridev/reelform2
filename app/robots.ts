import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

// Private and account pages are also marked noindex; blocking them here saves crawl budget.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account", "/auth/", "/login", "/setup", "/studio", "/unsubscribe", "/community/share"],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
