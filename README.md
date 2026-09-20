# Reelform

Tiffany blue AI video transformation studio with a luxury video landing page, Supabase accounts, a credit wallet, and Stripe subscription billing. React 19 / TypeScript / Vinext on Cloudflare Workers.

## Run

```sh
npm install
cp .env.example .env # only for a fresh checkout; do not overwrite configured secrets
npm run dev -- --port 3000
```

The existing local `.env` is ignored and contains connected Supabase, Stripe **test**, and Resend credentials. Generation requires the owner's funded Higgsfield API credentials. No OpenAI key is needed. Customer auth is Supabase; the hosting site's private audience gate is separate.

## Features

- `/`: scroll animations, video fan, pinned horizontal gallery, luxury Higgsfield concept videos, top hero prompt.
- `/studio`: source MP4 and reference uploads, server-inspected metadata, signed credit quote, explicit cost confirmation, durable job history, atomic credit reservation, exactly-once failure refunds. Ambiguous provider responses are held for review rather than submitted twice.
- `/pricing`: monthly/yearly subscriptions, credit packs, and transparent credit examples.
- `/account`: subscription changes/cancellation, Stripe payment portal, invoices, credit balance and ledger, optional capped auto-reload, generation history, profile, email preferences, password/email changes, global sign-out, and account deletion.
- `/login`, `/auth/confirm`: verified email auth and one-use password recovery; tokens are consumed on confirmation rather than page load.
- Branded Supabase templates plus opt-in welcome/day-2/day-7 marketing journeys, unsubscribe and suppression webhooks. See `emails/`.

## Verify

```sh
npx tsc --noEmit
npm run lint
npx --yes tsx --test tests/*.test.ts
npx --yes tsx --env-file=.env scripts/test-commerce.ts
npx --yes tsx --env-file=.env scripts/test-stripe.ts
# With local server running:
npx --yes tsx --env-file=.env scripts/test-auth-http.ts
npm run build
```

Integration tests create and clean up their own temporary Supabase users. Stripe tests require an `sk_test_` key and create sandbox payments only. They send no emails. Production data is never reset.

## Architecture and operations

Supabase migrations are in `supabase/migrations`. All `rf_` tables use RLS. Browser clients can read their own records; service-only RPCs perform monetary writes under per-user database locks. Keys stay server-side. Billing uses Stripe's current subscription invoice parent/pricing fields. The webhook endpoint must be publicly reachable and its signing secret must match the selected Stripe account.

`POST /api/cron/maintenance` accepts `Authorization: Bearer CRON_SECRET` and processes bounded batches of jobs, paid invoices, pending payments, auto-reloads, and opted-in marketing. Run it every minute for prompt job reconciliation; email journeys are deduplicated. Customer polling also updates active jobs. It is **not scheduled while the site is private**. Unknown provider submissions without a tracking ID and unknown payment outcomes require review; never blindly resubmit them.

Provider URLs are stored with generation history; this is not permanent video storage. Users should download finished videos promptly. Input: standard MP4 4–30s up to 100MB, up to four JPEG/PNG/WebP references of 10MB each. Outputs: 480p/720p. Demo media provenance is recorded in `public/media/provenance.json`.

See [launch setup](docs/LAUNCH.md), [pricing economics](docs/PRICING.md), and `.env.example`. Checkout and marketing remain disabled until their required production connections are ready.
