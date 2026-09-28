// Public links always use the customer-facing domain, including in previews.
// Auth and billing redirects depend on this exact origin being allow-listed.
export const SITE_URL = "https://reelform.io";
// Vercel serves the site from www and 308-redirects the apex there, so canonical
// URLs, the sitemap, and social cards point at www to avoid a redirect hop.
export const CANONICAL_ORIGIN = "https://www.reelform.io";
