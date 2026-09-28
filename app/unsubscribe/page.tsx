import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import Brand from "@/components/reelform/brand";
import "@/components/reelform/accounts.css";
export const metadata = pageMetadata({ title: "Email preferences", path: "/unsubscribe", index: false });
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; result?: string }>;
}) {
  const { token = "", result } = await searchParams;
  if (result === "done" || result === "invalid")
    return (
      <main className="setup-page">
        <Brand />
        <h1>{result === "done" ? "You’re unsubscribed." : "This link has expired."}</h1>
        <p role="status">
          {result === "done"
            ? "You won’t receive Reelform tips and inspiration anymore. Essential account and billing messages will still arrive."
            : "This unsubscribe link is invalid or has expired. You can turn off marketing emails in your account settings instead."}
        </p>
        <p>
          <a href="/account?tab=settings">Manage email preferences</a> · <Link prefetch={false} href="/">Back to Reelform</Link>
        </p>
      </main>
    );
  return (
    <main className="setup-page">
      <Brand />
      <h1>A little less in your inbox.</h1>
      <p>
        Unsubscribe from Reelform tips and inspiration. You’ll still receive
        essential account and billing messages.
      </p>
      <form
        method="post"
        action={`/api/email/unsubscribe?token=${encodeURIComponent(token)}`}
      >
        <button className="account-primary">Unsubscribe from marketing</button>
      </form>
      <p>
        <a href="/account?tab=settings">Manage email preferences</a>
      </p>
    </main>
  );
}
