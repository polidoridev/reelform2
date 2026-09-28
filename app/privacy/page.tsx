import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import Brand from "@/components/reelform/brand";
import { CookieSettingsButton } from "@/components/reelform/cookie-consent";
export const metadata = pageMetadata({
  title: "Privacy policy",
  description: "How Reelform handles your account, uploads, generations, payments, cookies, and analytics, and the choices you have.",
  path: "/privacy",
});
export default function Privacy() {
  return (
    <main className="setup-page">
      <Brand />
      <h1>Privacy policy</h1>
      <p>
        Last updated September 27, 2026. Contact:{" "}
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
      <h2>Editing on your device</h2>
      <p>
        The studio’s video editor trims, cuts, reorders, and mutes clips in your
        browser. Footage you edit is not uploaded until you choose to use it for a
        generation, and edits you download never leave your device.
      </p>
      <h2>Service providers</h2>
      <p>
        Higgsfield processes uploaded videos, reference photos, and prompts to
        generate transformations, and may automatically screen them for content
        it does not allow; screened requests can be blocked before a video is
        created. Stripe handles payments, billing addresses,
        invoices, and saved payment methods. Reelform receives payment
        identifiers, status, and limited card details such as the brand and last
        four digits, rather than full card numbers. Resend provides email
        delivery. Hosting and infrastructure providers process information
        needed to run and protect the website. These providers may process data
        outside your country.
      </p>
      <h2>Community videos</h2>
      <p>
        Publishing is optional. A published video, title, caption, selected
        creator name, AI-assisted label, and publication date are public and may
        be viewed without an account. Your account email, billing information,
        and private generation prompts are not included in the post. We store
        your publishing permission and its date. Supabase stores community media
        separately from private creations; community uploads are not sent to
        Higgsfield for generation or used by Reelform to train AI models.
      </p>
      <p>
        You can remove posts from the community or delete your account to remove
        all your posts. Public listing access ends on removal; previously issued
        playback links can remain valid for up to five minutes. Unfinished uploads
        are cleaned up after 24 hours by scheduled maintenance. Public content may
        have been saved by viewers; removal cannot recall their copies.
      </p>
      <h2>Email preferences</h2>
      <p>
        Marketing emails are optional. You can withdraw consent through the
        unsubscribe link or account settings. Essential security,
        password-reset, and billing emails are separate from marketing
        preferences. We record consent and unsubscribe choices, and suppress
        marketing after delivery failures or spam complaints.
      </p>
      <h2 id="cookies">Cookies and similar storage</h2>
      <p>
        Reelform uses a small number of first-party cookies. Essential cookies
        are needed for the site to work and are always on. Analytics runs only if
        you allow it, and you can change your choice at any time.
      </p>
      <div className="policy-table" role="region" aria-label="Cookies used by Reelform" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Type</th>
              <th scope="col">Lasts</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>sb-…-auth-token</code></td>
              <td>Keeps you signed in and protects account actions (Supabase).</td>
              <td>Essential</td>
              <td>Until you sign out or the session expires</td>
            </tr>
            <tr>
              <td><code>sb-…-code-verifier</code></td>
              <td>Completes a sign-in or email confirmation securely.</td>
              <td>Essential</td>
              <td>Minutes, during sign-in</td>
            </tr>
            <tr>
              <td><code>rf_consent</code></td>
              <td>Remembers whether you allowed analytics.</td>
              <td>Essential</td>
              <td>180 days</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The studio also keeps an in-progress generation in your browser’s session
        storage so a refresh doesn’t lose it; it is cleared when you close the
        tab. Checkout and the billing portal run on Stripe’s website, which sets
        its own cookies under Stripe’s policies.
      </p>
      <h2>Analytics</h2>
      <p>
        If you allow analytics, we use Vercel Web Analytics and Speed Insights to
        count visits and measure page performance. They do not use cookies, do
        not follow you across other websites, and report aggregated data such as
        pages viewed, referring site, country, device and browser type, and load
        times. If you choose essential cookies only, or your browser sends a
        Global Privacy Control signal, these scripts do not load.
      </p>
      <p>
        <CookieSettingsButton className="policy-button" />
      </p>
      <h2>Security</h2>
      <p>
        Private account data is restricted to its owner, and billing and credit
        updates are performed by authenticated server processes. No security
        measure can guarantee absolute protection.
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
      <h2>Your rights</h2>
      <p>
        Depending on where you live, including the EU, UK, and California, you
        may have the right to access, correct, delete, or receive a copy of your
        personal information, to object to or restrict certain processing, and to
        withdraw consent at any time. Reelform does not sell your personal
        information or share it for cross-context behavioral advertising. To make
        a request, email <a href="mailto:admin@polidori.dev">admin@polidori.dev</a>;
        we may need to verify your identity. You can also complain to your local
        data protection authority.
      </p>
      <h2>Age</h2>
      <p>
        Reelform is intended for people aged 18 and over. We do not knowingly
        collect information from children; contact us if you believe a child has
        created an account.
      </p>
      <h2>Changes</h2>
      <p>
        We will update this page when our practices change and revise the date at
        the top. For material changes, we will notify account holders by email.
      </p>
      <p>
        <Link prefetch={false} href="/terms">Terms of use</Link> · <Link prefetch={false} href="/">Back to Reelform</Link>
      </p>
    </main>
  );
}
