import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Brand from "@/components/reelform/brand";

// Next.js already marks 404 responses noindex; clear the inherited home-page canonical.
export const metadata = { title: "Page not found", alternates: { canonical: null } };

export default function NotFound() {
  return (
    <main className="setup-page not-found-page">
      <Brand />
      <p className="not-found-code">404</p>
      <h1>This scene didn’t make the cut.</h1>
      <p>The page you’re looking for has moved, expired, or never existed. Check the address, or pick up from one of these.</p>
      <div className="not-found-actions">
        <Link prefetch={false} href="/studio" className="button">
          Start creating <ArrowUpRight size={18} />
        </Link>
        <Link prefetch={false} href="/">Home</Link>
        <Link prefetch={false} href="/community">Community</Link>
        <Link prefetch={false} href="/pricing">Pricing</Link>
      </div>
      <p className="not-found-help">
        Looking for a shared video? It may have been removed by its creator. Something else wrong? Email{" "}
        <a href="mailto:admin@polidori.dev">admin@polidori.dev</a>.
      </p>
    </main>
  );
}
