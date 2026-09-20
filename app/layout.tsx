import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reelform | Same you. New reality.",
  description:
    "Your video. Any outfit, any place, any life. Reimagine your footage with reference photos and AI video transformation powered by Higgsfield.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Reelform | Same you. New reality.",
    description: "Turn the everyday into your next main character moment.",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
