import type { Metadata, Viewport } from "next";
import CookieConsent from "@/components/reelform/cookie-consent";
import { CANONICAL_ORIGIN } from "@/lib/site-url";
import { DEFAULT_DESCRIPTION, SHARE_IMAGE, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const title = "Reelform | AI Motion Transfer & Object Swap";
export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: { default: title, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: "/favicon.svg" },
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description: DEFAULT_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title, description: DEFAULT_DESCRIPTION, images: [SHARE_IMAGE.url] },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fcfcfd",
};

const organization = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${CANONICAL_ORIGIN}/#organization`,
      name: SITE_NAME,
      url: CANONICAL_ORIGIN,
      logo: `${CANONICAL_ORIGIN}/favicon.svg`,
      email: "admin@polidori.dev",
    },
    {
      "@type": "WebSite",
      "@id": `${CANONICAL_ORIGIN}/#website`,
      name: SITE_NAME,
      url: CANONICAL_ORIGIN,
      publisher: { "@id": `${CANONICAL_ORIGIN}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/manrope-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          // Static, server-built JSON; no user input is interpolated.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
        />
      </head>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
