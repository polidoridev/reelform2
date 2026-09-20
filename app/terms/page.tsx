import Link from "next/link";
import Brand from "@/components/reelform/brand";
export const metadata = { title: "Terms | Reelform" };
export default function Terms() {
  return (
    <main className="setup-page">
      <Brand />
      <h1>Terms of use</h1>
      <p>
        Last updated September 20, 2026. Questions:{" "}
        <a href="mailto:admin@polidori.dev">admin@polidori.dev</a>.
      </p>
      <h2>Your account and content</h2>
      <p>
        Use accurate account details and keep your credentials secure. Upload
        only footage, likenesses, and reference images you have permission to
        use. Do not use Reelform for fraud, impersonation without consent,
        harassment, or unlawful content. AI transformations are creative
        simulations; do not present them as evidence of events that did not
        happen.
      </p>
      <h2>Subscriptions and credits</h2>
      <p>
        Prices are shown in USD. Subscriptions renew automatically at the
        billing interval and price shown at checkout. Annual subscriptions are
        billed upfront and release credits each month. Unused subscription
        credits expire at the end of their monthly allocation period. Purchased
        credits do not expire and remain usable after subscription cancellation,
        while your account and the service remain available. Credits have no
        cash value and cannot be transferred.
      </p>
      <p>
        Extra credit purchases require an active paid subscription. Auto-reload
        is optional and off by default. If enabled, it charges the selected
        refill amount when the available balance falls below your threshold,
        subject to your calendar-month spending cap in UTC. Disable it in your
        account at any time.
      </p>
      <h2>Plan changes and cancellation</h2>
      <p>
        Plan and billing-period changes take effect at the next renewal. Cancel
        renewal in your account before the next billing date to prevent a future
        subscription charge. Cancellation keeps access for the period already
        paid. Deleting your account ends access and deletes the account’s
        credits and generation history.
      </p>
      <h2>Generation results and refunds</h2>
      <p>
        The studio displays the credit cost before submission. Generation
        quality varies and exact transformations are not guaranteed. Failed
        generations return reserved credits automatically. If the provider’s
        response is interrupted, the request may need review before its final
        status is known; contact support with the generation ID. For billing
        errors or refund requests, email support. Any rights you have under
        applicable consumer law remain unaffected.
      </p>
      <h2>Files and service availability</h2>
      <p>
        Download completed videos promptly. Provider download links may expire;
        Reelform is not a permanent media backup. The service depends on
        external providers and may experience interruptions or changes. We may
        restrict misuse, investigate disputed payments, and update these terms
        with notice for material changes.
      </p>
      <p>
        <Link href="/privacy">Privacy policy</Link> · <Link href="/">Back to Reelform</Link>
      </p>
    </main>
  );
}
