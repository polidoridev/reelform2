# Reelform

Royal blue AI video transformation studio with a luxury video landing page, Supabase accounts, a credit wallet, and Stripe subscription billing. React 19 / TypeScript / Vinext on Cloudflare Workers.

## Run

```sh
npm install
cp .env.example .env # only for a fresh checkout; do not overwrite configured secrets
npm run dev -- --port 3000
```

The existing local `.env` is ignored and contains connected Supabase, Stripe **test**, and Resend credentials. Generation requires the owner's funded Higgsfield API credentials. No OpenAI key is needed. Customer auth is Supabase; the hosting site's private audience gate is separate.

## Features

- `/`: scroll animations, video fan, pinned horizontal gallery, luxury Higgsfield concept videos, top hero prompt.
- `/studio`: chat-style video composer with original video and reference-image attachments, prompt, and one-step Send. Upload preparation and signed credit pricing run automatically; model, quality, and sound remain available under generation settings. Progress and completed videos appear in the conversation. Server-inspected metadata, durable job history, atomic credit reservation, and exactly-once failure refunds remain enforced. Interrupted sends preserve their original request ID across reloads; ambiguous provider responses are held for review rather than submitted twice.
- `/pricing`: monthly/yearly subscriptions, credit packs, and transparent credit examples.
- `/community`: public creator gallery, individual video links, creator attribution, AI labels, owner removal, and report links. `/community/share` provides authenticated, explicitly opted-in publishing with a local video preview. Creators retain their rights; see `/terms#creator-rights`.
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
node --env-file=.env --import tsx scripts/test-community.ts
npm run build
```

Integration tests create and clean up their own temporary Supabase users. Stripe tests require an `sk_test_` key and create sandbox payments only. They send no emails. Production data is never reset.

`node scripts/test-studio-chat.mjs` verifies the composer in Chromium against simulated APIs, without provider calls or paid generations. It requires Playwright and a running local server. Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is not installed in this checkout; optionally set `TEST_CDP_URL` to an owned browser's CDP URL and `TEST_BASE_URL` to a different local address. It covers attachment uploads, automatic pricing, settings changes, Send, playback, mobile layout, failed uploads, interrupted-request recovery, and insufficient credits.

## Architecture and operations

Supabase migrations are in `supabase/migrations`. All `rf_` tables use RLS. Browser clients can read their own records; service-only RPCs perform monetary writes under per-user database locks. Keys stay server-side. Billing uses Stripe's current subscription invoice parent/pricing fields. The webhook endpoint must be publicly reachable and its signing secret must match the selected Stripe account.

`POST /api/cron/maintenance` accepts `Authorization: Bearer CRON_SECRET` and processes bounded batches of jobs, paid invoices, pending payments, auto-reloads, and opted-in marketing. Run it every minute for prompt job reconciliation; email journeys are deduplicated. Customer polling also updates active jobs. It is **not scheduled while the site is private**. Unknown provider submissions without a tracking ID and unknown payment outcomes require review; never blindly resubmit them.

Provider URLs are stored with generation history; this is not permanent video storage. Users should download finished videos promptly. Studio input: MP4, MOV, M4V, or WebM, 4–30 seconds up to 1 GB, with up to four JPEG/PNG/WebP references of 10 MB each. Available quality (480p, 720p, or 1080p), duration, references, and sound depend on the selected model. Demo media provenance is recorded in `public/media/provenance.json`.

See [launch setup](docs/LAUNCH.md), [pricing economics](docs/PRICING.md), and `.env.example`. Checkout and marketing remain disabled until their required production connections are ready.

## Community publishing

Apply `20260921133216_reelform_community.sql` before deploying the gallery routes. It creates the service-only, RLS-enabled `rf_community_posts` table and the private `reelform-community` bucket. No additional API keys or public storage policies are needed. It has been applied to the connected Supabase project and recorded in migration history.

Community uploads accept MP4/WebM videos of 4–30 seconds, up to 50 MB. A verified account can reserve 10 uploads per rolling 24 hours and keep 50 active posts/drafts. A database lock enforces reservations under concurrency. Signed, non-overwriting uploads go directly to storage. Publishing checks stored size/type and video metadata, records explicit permission, and only then exposes the post. The public response omits account identifiers, email, and storage paths. Playback URLs expire after five minutes. Private studio creations are never automatically published or changed by community removal.

Creators and server-authorized Reelform administrators can remove posts. Report links open an email draft to support with the post ID; they do not send automatically. Account deletion withdraws posts and removes community files before deleting the user. The existing maintenance endpoint also cleans abandoned uploads and deletion tombstones older than 24 hours in batches of 20. Schedule that endpoint for public launch; the current private preview has no scheduler. Public copy promises creator ownership and a limited hosting/display permission, with no advertising, resale, or AI-training grant from community publication.
