import type { Metadata } from "next";

export const SITE_NAME = "Reelform";
export const SHARE_IMAGE = { url: "/og-image.jpg", width: 1200, height: 630, alt: "Reelform: your footage, new possibilities. AI motion transfer and object swap." };
export const DEFAULT_DESCRIPTION =
  "Transfer your video’s motion to a new character with Genjutsu. Upload a clip, add a reference photo, and review the credit cost. Object swaps and video editing are available too.";

// Page metadata with a canonical URL and matching social previews. The title is
// completed by the root template ("… | Reelform").
export function pageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  index = true,
}: {
  title: string;
  description?: string;
  path: string;
  index?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    // Page-level openGraph/twitter replace the root values, so the image is repeated here.
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url: path, siteName: SITE_NAME, type: "website", images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description, images: [SHARE_IMAGE.url] },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}
