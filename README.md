# Reelform

Royal blue AI video transformation studio with a luxury video landing page, Supabase accounts, a credit wallet, and Stripe subscription billing. React 19 / TypeScript / Vinext on Cloudflare Workers.

## Run

```sh
npm install
cp .env.example .env # only for a fresh checkout; do not overwrite configured secrets
npm run dev -- --port 3000
```

The existing local `.env` is ignored and contains connected Supabase, Stripe **test**, and Resend credentials. Generation requires the owner's funded Higgsfield API credentials. OpenAI is optional and used only for Aura AI planning; manual editing and Higgsfield generation do not require it. Customer auth is Supabase; the hosting site's private audience gate is separate.

## Features

- `/aura`: a local montage editor for 1–8 uploaded clips. Velocity, Midnight, and Clean cut styles combine tempo-aligned cuts, color treatment, and motion; choose one of three original synthesized beats or upload music. Exports 8–30 second H.264/AAC MP4s at 720p/30 fps in portrait, landscape, or square. Music replaces source audio; uploaded tracks offer a local beat estimate plus adjustable BPM and a first-beat offset. Files and exports remain on the device and are not saved to the account. Manual edits need no API credentials, account, or credits. Optional AI planning requires a verified account and sends only three small frames per clip plus instructions to OpenAI. Plans support shot selection, timing, per-shot style, and follow-up revisions. This is a footage-editing workflow, not a Katana API integration or AI character replacement.
- `/`: scroll animations, video fan, pinned horizontal gallery, luxury Higgsfield concept videos, top hero prompt.
- `/studio`: chat-style video composer with original video and reference-image attachments, prompt, and one-step Send. Upload preparation and signed credit pricing run automatically; model, quality, and sound remain available under generation settings. Progress and completed videos appear in the conversation. Server-inspected metadata, durable job history, atomic credit reservation, and exactly-once failure refunds remain enforced. Interrupted sends preserve their original request ID across reloads; ambiguous provider responses are held for review rather than submitted twice.
- `/pricing`: monthly/yearly subscriptions, credit packs, and transparent credit examples.
- `/community`: public creator gallery, individual video links, creator attribution, AI labels, owner removal, and report links. `/community/share` provides authenticated, explicitly opted-in publishing with a local video preview. Creators retain their rights; see `/terms#creator-rights`.
- `/account`: subscription changes/cancellation, Stripe payment portal, invoices, credit balance and ledger, optional capped auto-reload, generation history, profile, email preferences, password/email changes, global sign-out, and account deletion.
- `/login`, `/auth/confirm`: verified email auth and one-use password recovery; tokens are consumed on confirmation rather than page load.
- Branded Supabase templates plus opt-in welcome/day-2/day-7 marketing journeys, unsubscribe and suppression webhooks. See `emails/`.

## Verify

Aura checks: `npx --no-install tsx --test tests/aura-edit.test.ts` validates cut timing and source bounds. With the local server on port 3012, `node scripts/test-aura-editor.mjs` creates synthetic footage, exports real portrait and landscape MP4s in Chrome, decodes output video/audio with FFmpeg, and checks uploaded music, cancellation, validation, and mobile layout. Set `PLAYWRIGHT_MODULE` to an installed Playwright module and `TEST_BASE_URL` to override the server address. It makes no provider requests. New media code is loaded only when needed in the browser; export needs WebCodecs H.264/AAC support.

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

## Payment confirmation and low-credit notices

Checkout returns include a Stripe session ID. The authenticated confirmation route checks the session’s customer and paid status before invoking the same idempotent fulfillment used by webhooks. Both subscription and top-up returns retry pending confirmation; a success URL alone cannot grant access. Subscription lifecycle events update billing status, while a verified paid invoice activates the plan’s features.

Account and Studio show an accessible in-app notification when total available credits reach 10% of the plan’s monthly allowance (Starter: 200; Pro: 550; Studio: 1,500), including a distinct zero-credit message and a link to manage credits. The notification clears when the displayed balance recovers and is suppressed for admins and unused free trials. These notifications do not send email.

`node scripts/test-credit-notice.mjs` checks the mobile warning, zero balance, refill recovery and admin exclusion with simulated account APIs. It accepts the same `PLAYWRIGHT_MODULE` and `TEST_BROWSER_CHANNEL` options as the other browser scripts; its default URL is `http://localhost:5173`.

## Instagram publishing

Finished, privately saved videos can be published as Instagram Reels from the studio or My creations. Account → Instagram connects a Creator/Business account and shows publishing history. The feature stays disabled until its server credentials are configured. See [Instagram setup and verification](docs/INSTAGRAM.md) for Meta permissions, callback URLs, encryption, maintenance scheduling, and testing.

## Higgsfield API review — October 12, 2026

Studio now includes Wan 3.0 Create and Wan 3.0 Prime Create for text, photo, and video-reference generation. Both use output-second pricing and model-specific shape validation. Existing plan limits remain enforced. See [the API audit](docs/higgsfield-api-audit.json) for verified schemas, standard rates, other catalog findings, and Katana's unresolved API/asset licensing status. No Katana gallery videos were imported or renamed.

Run `npx --no-install tsx --test tests/wan-models.test.ts tests/video-models.test.ts` for adapter and pricing checks. With a local server, `node --import tsx scripts/test-wan-models.mjs` checks studio selection, shapes, quotes, submission, and playback against simulated services; it accepts `PLAYWRIGHT_MODULE`, `TEST_BROWSER_CHANNEL`, and `TEST_BASE_URL`. No paid generation is submitted by these tests.


## Aura AI planning on Vercel

Set the following server-only environment variables in the Vercel project. Scope to Production, and separately to Preview if you want AI enabled there. Redeploy after saving them. Never prefix the key with `NEXT_PUBLIC_`.

| Variable | Value | Required |
| --- | --- | --- |
| `OPENAI_API_KEY` | Your OpenAI project API key; store as a Secret | Yes, for AI planning |
| `AURA_AI_ENABLED` | `true` | Yes, for AI planning |
| `OPENAI_AURA_MODEL` | `gpt-5.4-mini` | Optional; this is the default |
| `AURA_AI_DAILY_LIMIT` | `10` | Optional; requests per verified user per UTC day |
| `AURA_AI_GLOBAL_DAILY_LIMIT` | `200` | Optional; requests across the site per UTC day |

The existing Supabase URL, anon key, and service role key are reused. Migration `20261013014758_aura_ai_limits.sql` is applied to the connected Reelform project; apply it to any separate preview/test database before enabling AI there. Reservations are atomic across serverless instances, with an additional fixed two-request-per-minute limit per user. Attempts count once reserved, including provider failures or canceled submissions; there are no automatic paid retries. Manual export remains available when the key is missing or limits are reached. These are request-count limits, not dollar budgets. OpenAI bills the site's API account; no Reelform wallet debit is added by this feature.

`POST /api/aura/plan` requires verified sign-in and a same-origin request. It accepts at most 1.8 MB, eight clips with three 320px JPEG frames each, and 1,500 prompt characters. It calls the OpenAI Responses API with strict structured output and `store: false`, a 50-second timeout, and a 6,000-token output cap. Only validated clip bounds and complete timelines reach the renderer. Sparse frame analysis can miss actions between samples; the plan remains reviewable and can be revised in plain language. Rendering and audio stay local. The beat estimator uses local onset analysis and can be wrong for syncopated or changing-tempo music; its result remains adjustable.

Verification: `npx --no-install tsx --test tests/aura-ai.test.ts tests/aura-edit.test.ts tests/auth-destination.test.ts`. With the dev server running, `node scripts/test-aura-ai.mjs` mocks OpenAI's planner boundary while extracting real JPEGs and exporting a real MP4; it verifies that the AI-selected clip actually appears first, follow-up context, invalid responses, limits, manual fallback, and mobile layout. It uses the same Playwright environment variables as the other browser tests. Live OpenAI output has not been verified without a configured key.
