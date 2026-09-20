import Link from "next/link";
import Brand from "@/components/reelform/brand";
export const metadata = { title: "Privacy | Reelform" };
export default function Privacy() {
  return (
    <main className="setup-page">
      <Brand />
      <h1>Privacy policy</h1>
      <p>
        Last updated September 20, 2026. Contact:{" "}
        <a href="mailto:admin@polidori.dev">admin@polidori.dev</a>.
      </p>
      <h2>Information used by Reelform</h2>
      <p>
        We process your name, email, account settings, subscription and credit
        records, prompts, uploaded footage and references, and generation
        results to provide the service. Supabase manages account authentication
        and account data. Passwords are handled by the authentication provider;
        Reelform does not store readable passwords.
      </p>
      <h2>Service providers</h2>
      <p>
        Higgsfield processes uploaded videos, reference photos, and prompts to
        generate transformations. Stripe handles payments, billing addresses,
        invoices, and saved payment methods. Reelform receives payment
        identifiers, status, and limited card details such as the brand and last
        four digits, rather than full card numbers. Resend provides email
        delivery. Hosting and infrastructure providers process information
        needed to run and protect the website. These providers may process data
        outside your country.
      </p>
      <h2>Email preferences</h2>
      <p>
        Marketing emails are optional. You can withdraw consent through the
        unsubscribe link or account settings. Essential security,
        password-reset, and billing emails are separate from marketing
        preferences. We record consent and unsubscribe choices, and suppress
        marketing after delivery failures or spam complaints.
      </p>
      <h2>Cookies and security</h2>
      <p>
        Reelform uses essential session cookies to keep you signed in and
        protect account actions. Account data is restricted to its owner, and
        billing and credit updates are performed by authenticated server
        processes. No security measure can guarantee absolute protection.
      </p>
      <h2>Retention and your choices</h2>
      <p>
        Your account settings, credit records, and generation history remain
        while your account is active. Media download links can expire according
        to provider retention. Account deletion removes Reelform’s account
        records and ends the subscription. Providers may retain transaction,
        security, backup, or legally required records under their own policies.
        Contact us to request access, correction, or deletion of your personal
        information.
      </p>
      <p>
        <Link prefetch={false} href="/terms">Terms of use</Link> · <Link prefetch={false} href="/">Back to Reelform</Link>
      </p>
    </main>
  );
}
