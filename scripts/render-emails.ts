import { mkdirSync, writeFileSync } from "node:fs";
import { emailFrame, journeys } from "../lib/commerce/email";
mkdirSync("emails/supabase", { recursive: true });
const templates = [
  [
    "confirm-sign-up",
    "Confirm your Reelform account",
    "Your next reality starts here.",
    "Confirm your email to open your Reelform account and start bringing your ideas to life.",
    "Confirm my email",
    "signup",
  ],
  [
    "invite-user",
    "Your invitation to Reelform",
    "You’re invited.",
    "Your Reelform account is waiting. Accept your invitation and step into your next scene.",
    "Accept invitation",
    "invite",
  ],
  [
    "magic-link-or-otp",
    "Your Reelform sign-in link",
    "Welcome back.",
    "Use this one-time link to securely sign in to Reelform.",
    "Sign in to Reelform",
    "magiclink",
  ],
  [
    "change-email-address",
    "Confirm your new Reelform email",
    "A new address. Same imagination.",
    "Confirm this email address to complete your account email change.",
    "Confirm email change",
    "email_change",
  ],
  [
    "reset-password",
    "Reset your Reelform password",
    "Let’s get you back in.",
    "We received a request to reset your Reelform password. Use the button below to choose a new password.",
    "Reset my password",
    "recovery",
  ],
  [
    "reauthentication",
    "Your Reelform security code",
    "A quick security check.",
    'Enter this one-time code to confirm it’s you:<br><strong style="font-size:30px;letter-spacing:6px">{{ .Token }}</strong>',
    "",
    "",
  ],
];
const manifest: Record<string, { subject: string; file: string }> = {};
for (const [id, subject, title, body, button, type] of templates) {
  // SiteURL is configured to the new production origin at launch. Using a fixed
  // application route avoids URL fragments being consumed by email scanners.
  const url = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}`;
  const footer =
    'If you didn’t request this, you can safely ignore this email. Never share your sign-in links or security codes.<br>Need help? <a href="mailto:admin@polidori.dev" style="color:#356b64">admin@polidori.dev</a><br>Reelform · Your reality, reimagined.';
  const file = `emails/supabase/${id}.html`;
  writeFileSync(file, emailFrame(title, `<p>${body}</p>`, button, url, footer));
  manifest[id] = { subject, file };
}
for (const [id, description] of Object.entries({
  "password-changed": "Your password was changed.",
  "email-address-changed": "Your account email address was changed.",
  "phone-number-changed": "Your phone number was changed.",
  "sign-in-method-linked": "A sign-in method was linked to your account.",
  "sign-in-method-removed": "A sign-in method was removed from your account.",
  "mfa-method-added": "A verification method was added to your account.",
  "mfa-method-removed": "A verification method was removed from your account.",
})) {
  const file = `emails/supabase/${id}.html`;
  manifest[id] = { subject: `Reelform security alert: ${description}`, file };
  writeFileSync(
    file,
    emailFrame(
      "Your account was updated.",
      `<p>${description}</p><p>If this was you, you’re all set. If you don’t recognize this change, reset your password and contact us right away.</p>`,
      "Review my account",
      "{{ .SiteURL }}/account?tab=settings",
      'Reelform security notification<br><a href="mailto:admin@polidori.dev">admin@polidori.dev</a>',
    ),
  );
}
writeFileSync(
  "emails/supabase/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
mkdirSync("emails/previews", { recursive: true });
for (const [id, j] of Object.entries(journeys))
  writeFileSync(
    `emails/previews/${id}.html`,
    emailFrame(
      j.title,
      j.body,
      j.button,
      "http://localhost:3000/studio",
      'Preview only · Business mailing address is required before sending.<br><a href="http://localhost:3000/account?tab=settings">Email preferences</a>',
    ),
  );
console.log("Rendered 13 auth/security templates and 3 marketing previews.");
