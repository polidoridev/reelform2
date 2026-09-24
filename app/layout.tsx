import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reelform | AI Motion Transfer & Object Swap",
  description:
    "Transfer motion to characters and swap objects in your footage with Genjutsu. Create character remixes, construction concepts, and product videos in Reelform.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Reelform | AI Motion Transfer & Object Swap",
    description: "Your footage. New possibilities. Explore AI motion transfer and object swaps for content, client projects, and creative experiments.",
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
