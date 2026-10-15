import Link from "next/link";
import Brand from "@/components/reelform/brand";
import InstagramPublisher from "@/components/reelform/instagram-publisher";
import { pageMetadata } from "@/lib/seo";
import "@/components/reelform/accounts.css";
export const metadata = pageMetadata({
  title: "Publish to Instagram",
  path: "/instagram",
  index: false,
});
export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ generation?: string; instagram?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="account-shell instagram-page">
      <header className="instagram-nav">
        <Brand />
        <nav aria-label="Publishing navigation"><Link href="/studio" className="quick-access-tab">TransferLab</Link><Link href="/account?tab=creations">Back to my creations</Link></nav>
      </header>
      <div className="instagram-page-body">
        <span className="instagram-eyebrow">
          FROM REELFORM TO YOUR AUDIENCE
        </span>
        <h1>Share your next Reel.</h1>
        <p className="instagram-intro">
          Create your video, write a caption, and choose when it goes live. Included with Pro and Studio.
        </p>
        <InstagramPublisher
          generation={query.generation}
          outcome={query.instagram}
        />
      </div>
    </main>
  );
}
