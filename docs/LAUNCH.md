# Production connection status

The account system is implemented and tested. The hosted preview remains owner-private. `BILLING_ENABLED=false` and `MARKETING_ENABLED=false` deliberately prevent incomplete production connections from accepting purchases or sending campaigns.

## Required to launch

1. Use `https://reelform.io` as the public customer domain and Supabase Site URL. Allow `https://reelform.io/auth/confirm` and `https://reelform.io/auth/callback` in Supabase Redirect URLs, install the templates in `emails/supabase`, and make the hosting audience public only as authorized by the owner. The private preview cannot receive Stripe/Resend webhooks or one-click unsubscribe requests from external providers.
2. Add funded `HF_API_KEY_ID` and `HF_API_KEY_SECRET` to server environment settings. Run representative real edits and compare provider debits with credit quotes. No OpenAI key is required.
3. Connect the live Stripe secret key for account `acct_1TueyBFU3rOWIrJs`. Use its live price IDs in `stripe-live-prices.json`, not sandbox IDs. The three new annual prices are already created and verified in the live catalog. Add a live customer portal configuration with payment-method updates, invoice history, and end-of-period cancellation. Plan changes are handled by Reelform at renewal.
4. Register `https://YOUR_DOMAIN/api/webhooks/stripe` for `invoice.paid`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `payment_intent.succeeded`, `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, and `charge.dispute.created`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`. Resolve the live account's “Action required” information notice in Stripe. Review tax settings for your business before enabling paid checkout. Update legacy website-builder product descriptions/features to describe video credits before launch, while preserving existing customer entitlements.
5. Verify `polidori.dev` in Resend. The prepared records are in `email-dns.json`; nameservers currently point to Namecheap. Add the provided sender-domain records without replacing unrelated root-domain MX records. Then verify the domain in Resend.
6. Supabase currently has a legacy Gmail SMTP configuration. After domain verification, set SMTP to `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key, sender email `admin@polidori.dev`, sender name `Reelform`. Enter this credential directly in the provider settings. Supabase auth templates for confirmation, invitation, magic link, email change, password reset, and reauthentication have been updated. The seven additional security-notification templates are prepared in `emails/supabase`; their notification switches stay off until SMTP delivery is verified.
7. Supply the business mailing address for `MARKETING_POSTAL_ADDRESS`. Add a Resend webhook at `/api/webhooks/email` for delivered/bounced/complained/suppressed events and configure `RESEND_WEBHOOK_SECRET`. Set `EMAIL_DOMAIN_VERIFIED=true` only after successful verification. Marketing opt-in stays unchecked by default.
8. Schedule authenticated `POST /api/cron/maintenance` every minute with `Authorization: Bearer CRON_SECRET`. Do this through a server scheduler (for example Supabase Cron + Vault + pg_net); do not expose the cron secret in browser code or query strings. Endpoint batches are bounded; increase cadence/batch capacity as the customer count grows. No schedule has been registered against the private preview.
9. Send a real signup and reset email to an owner-approved test address, complete a test checkout and webhook round trip on the chosen public origin, then enable `BILLING_ENABLED=true`. Enable `MARKETING_ENABLED=true` after sender, footer, unsubscribe, and scheduler checks pass.

Keep API keys in environment settings, never source control or chat. The live catalog already has an active Pro subscription; existing monthly prices and subscribers were not changed. Existing customers must be linked/migrated deliberately before retiring the previous website. The new `rf_` schema does not silently import or grant entitlements from the previous schema.

## Operational behavior

- User balances and expiration windows use the database clock. Annual purchases schedule 12 monthly grants.
- Failed jobs refund once. Refunds that cross an allowance's expiration become usable adjustment credits. Unknown provider submissions without IDs need manual review in the provider dashboard; do not automatically retry them.
- Credit packs grant only after a matching USD payment succeeds. Uncertain auto-reload payments stay pending; a signed success webhook reconciles them. Card declines or authentication requirements disable auto-reload and appear in credit purchase history.
- Payment disputes/refunds put the account on hold. Resolve refunds/disputes and remaining credits before removing the hold.
- Marketing journeys: welcome within day 1; first-scene tips on days 2–3 only if no completed video; inspiration on days 7–8. All require current consent and suppression checks. A delivery of uncertain status is not resent blindly.
- Generation links are provider-hosted and may expire. This release stores job history, not permanent media backups.

## Verification completed

TypeScript, production build, database concurrency/RLS tests, duplicate credit grant/refund tests, annual release windows, server MP4 inspection, real Stripe sandbox invoice/top-up/auto-reload tests, signed webhook replay and rejection, scheduled plan changes, and real HTTP auth/recovery/logout tests. Browser checks cover desktop account tabs and 390px mobile pricing/settings without horizontal overflow. Test users and Stripe sandbox objects are cleaned up.

Supabase advisors also surfaced pre-existing legacy-schema notices unrelated to the new `rf_` tables. Review [security-definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), and [MFA configuration](https://supabase.com/docs/guides/auth/auth-mfa) before broader rollout. Service-only tables intentionally have RLS enabled with no browser policy.

## Owner testing and signup behavior

`stefano@polidori.dev` has server-managed `app_metadata.reelform_admin=true` for free Reelform generation. Admin jobs reserve zero credits, keep normal job tracking and a three-job concurrency limit, and never trigger auto-reload. Higgsfield still bills its API account. The role is checked against current Auth metadata in the server and database; user-editable profile metadata cannot grant it. Admin subscription/credit purchase requests are rejected to prevent accidental self-charges. Revoking the app-metadata flag removes the exemption for new jobs.

As verified on 2026-09-20, the Supabase project currently auto-confirms email/password signups. Signup now redirects immediately when Supabase returns a session; it only displays the confirmation-email message when no session is returned. No email-confirmation setting was changed by this fix. Configure and test SMTP, then require email confirmation before public launch. Password-reset delivery errors now surface instead of reporting that an email is on its way.

Regression commands (with server environment loaded): `node --env-file=.env --import tsx scripts/test-signup-http.ts` and `node --env-file=.env --import tsx scripts/test-admin-access.ts`. These create and remove temporary accounts without sending email or calling paid generation endpoints.
