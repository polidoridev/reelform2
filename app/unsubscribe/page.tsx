import Brand from "@/components/reelform/brand";
import "@/components/reelform/accounts.css";
export default async function Unsubscribe({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
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
