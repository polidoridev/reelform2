# Instagram publishing

Reelform can connect one Instagram Creator or Business account per user and publish a saved, completed generation as a Reel. The studio result and My creations link to `/instagram?generation=<job-id>`; Account → Instagram manages the connection and recent posts. Active Pro and Studio subscribers preview the exact saved video, write a caption, choose whether to include it in their feed, and confirm publication now or at a scheduled time. Starter, expired subscriptions, and credit-only accounts cannot connect or submit posts. Downgraded users can still view history, cancel queued posts, and disconnect. A generation prompt is never automatically used as a caption.

## Enable the integration

The additive migration `supabase/migrations/20261005165624_instagram_publishing.sql` was applied to the connected Reelform Supabase project during implementation. Apply it to any other environment before enabling the feature. No packages or public storage permissions are needed.

1. Create a Meta developer app and configure **Instagram API with Instagram Login**. Use the Instagram app ID and secret from that product, which can differ from the parent Meta app’s credentials. This login path does not require a Facebook Page.
2. Register the exact OAuth redirect URI: `https://www.reelform.io/api/instagram/callback`. The page used to start the connection must have that same origin. The `www` origin avoids the apex redirect and keeps the secure callback cookie on the correct host. Use a separately configured HTTPS preview/tunnel origin for local OAuth testing.
3. Request only `instagram_business_basic` and `instagram_business_content_publish`. Add a professional Instagram test account with the required app role to test before public approval. Complete Meta’s App Review / Advanced Access requirements for customers who are not app-role users. Complete any business verification Meta requests.
4. Configure the privacy policy as `https://www.reelform.io/privacy`, the data-deletion **instructions URL** as `https://www.reelform.io/privacy#instagram`, and the deauthorization callback as `https://www.reelform.io/api/instagram/deauthorize`. This implementation uses an instructions URL for data deletion, not an automated data-deletion callback.
5. Set the following **server-only** environment variables in the deployment:

   ```dotenv
   INSTAGRAM_ENABLED=true
   INSTAGRAM_APP_ID=<Instagram app ID>
   INSTAGRAM_APP_SECRET=<Instagram app secret>
   INSTAGRAM_TOKEN_KEY=<dedicated 32-byte key encoded as base64>
   INSTAGRAM_REDIRECT_URI=https://www.reelform.io/api/instagram/callback
   INSTAGRAM_API_VERSION=v25.0
   ```

   Generate the encryption key with `openssl rand -base64 32` and enter it directly in your secret manager. Never put secrets in chat, source control, screenshots, or browser variables. Keep this key stable: changing it requires existing users to reconnect.
6. Apply `supabase/migrations/20261012154856_instagram_scheduling.sql` (applied to the connected project on October 12, 2026), then deploy. `vercel.json` registers `GET /api/cron/instagram` every minute, authenticated with `CRON_SECRET`. Confirm the deployed Vercel project supports this cron frequency and that invocations succeed. Other hosts must schedule this authenticated GET themselves. The existing `POST /api/cron/maintenance` also advances the queue; concurrent runs are safe. Browser polling is optional and the server scheduler continues when the user closes the page.
7. Connect a test account, publish an explicitly approved test Reel, verify it in Instagram, then disconnect and test revoked permissions. Public customer publishing remains unavailable until the required Meta permissions are approved.

`INSTAGRAM_ENABLED` defaults to off. Missing credentials, encryption key, or a valid HTTPS callback produce a setup-in-progress message. No fake success or real publishing is possible while disabled. The October 5, 2026 audit confirmed all six Instagram settings exist as sensitive production variables in Vercel, and the production API reports ready. A real Instagram authorization/code exchange and live Reel publication still need verification with a professional test account.

## Data and security

- `rf_instagram_connections` stores account identifiers and AES-256-GCM encrypted tokens, bound to the Reelform user ID. Tokens never appear in API responses. Long-lived tokens refresh within seven days of expiry, once old enough to refresh; expired/revoked connections require sign-in again.
- `rf_instagram_oauth_states` stores hashed ten-minute random states bound to the signed-in user. A secure, HTTP-only, SameSite=Lax browser cookie must match. The callback atomically consumes the state once. Starting another connection invalidates older attempts for that Reelform user. Switching accounts cancels unsent work for the old account; uncertain old requests remain in history and cannot be blindly retried.
- `rf_instagram_posts` records the explicitly approved caption, feed preference, target account, processing status, and resulting link. All three tables have RLS enabled, no browser grants or policies, and service-role-only access. All app reads and writes enforce the verified account owner.
- Mutations require same-origin requests. The deauthorization endpoint instead verifies Meta’s signed request using the Instagram app secret. Connection errors never echo Meta token/code/error details into redirects or customer messages.
- Publishing accepts a generation ID, never an arbitrary video URL. It requires an owned, completed generation archived in the private creations bucket. Meta receives a one-hour signed storage URL to fetch that one file; storage stays private. Instagram validates media compatibility during container processing. Local-only video-editor exports are not saved generations and are not covered by this integration.
- Disconnect deletes the token, cancels work not yet submitted, and preserves publishing history. An in-flight publish may complete. Published Instagram Reels are not deleted by disconnecting or deleting Reelform. Account deletion cascades all three new tables. The privacy policy includes data-deletion instructions.

## Duplicate protection and recovery

A database unique constraint permits one posting record per user, generation, and Instagram account. Compare-and-swap revision checks serialize concurrent workers. The worker records `publishing` **before** making one `media_publish` call. A timeout, malformed response, or interrupted database write never triggers a blind resubmission. Instead, the worker checks the same container for `PUBLISHED`. If the result remains uncertain, the UI asks the user to check Instagram and keeps retries disabled.

Queued posts can be cancelled atomically before a worker claims them. A cancelled Reel can be scheduled again. Definitively failed preparation/processing attempts can be retried explicitly with the same reviewed caption and feed preference. Published or uncertain attempts cannot be retried. If the API confirms publication after a lost response but provides no media ID, the UI links to the Instagram profile rather than inventing a Reel URL. Users can return to the publishing screen after a reload; pending work is stored in the database, not browser memory.

## Verification

```sh
npx tsc --noEmit
npx eslint lib/instagram app/api/instagram app/instagram components/reelform/instagram-publisher.tsx components/reelform/instagram-icon.tsx tests/instagram.test.ts scripts/test-instagram-integration.ts
npx tsx --test tests/instagram.test.ts tests/auth-destination.test.ts
node --env-file=.env --import tsx scripts/test-instagram-integration.ts
# Test deployed configuration and OAuth cancellation without contacting Instagram:
TEST_APP_URL=https://www.reelform.io node --env-file=.env --import tsx scripts/test-instagram-connection.ts
# Also exercise actual HTTP authentication/CSRF with the dev server configured disabled:
TEST_APP_URL=http://localhost:5173 node --env-file=.env --import tsx scripts/test-instagram-integration.ts
# With the local Next server running; set PLAYWRIGHT_MODULE if needed:
node scripts/test-instagram-ui.mjs
```

The integration script creates isolated temporary Supabase users and records and removes them in `finally`. It mocks Instagram and signed media URLs: no real post, paid generation, payment, or email is sent. It verifies token refresh and revocation, real database concurrency, owner isolation, both anonymous and authenticated access denial, one-time OAuth-state consumption, safe retry, and disconnect. Browser tests mock APIs and exercise the actual desktop/mobile publishing screen.

The connection script uses a temporary Reelform account against the selected deployment. It checks configuration readiness, the authorization URL and scopes, secure cookie flags, stored state ownership, browser binding, cancellation, and replay rejection. It never follows the Instagram authorization URL or exchanges a code. Passing it does not verify Meta app approval, the provider-side redirect allowlist, or a successful Instagram login.

The October 5 security review also added regression coverage for truncated GCM tags, malformed callback configuration and state cookies, invalid signed payloads, imprecise provider IDs, malformed refreshed tokens, and container failures following uncertain publication. A later container error cannot make a possibly published Reel retryable.

Primary references checked during implementation:

- [Instagram Business Login, token exchange and refresh](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)
- [Instagram profile fields](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started/)
- [Content publishing and container status](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Scheduling and captions

Captions are written manually. AI caption generation and its provider configuration have been removed. Apply the follow-up removal migration along with the scheduling migration; the earlier applied migration is retained as database history.

- Users choose a local date/time; the browser converts it to an explicit UTC timestamp. The API accepts times at least one minute ahead and up to 90 days out. Scheduled times persist across reloads and display in the viewer’s local time zone.
- The worker excludes future posts from its batch. Containers and signed video URLs are created only when due, avoiding expired uploads. Publication may occur a few minutes after the selected time while Instagram processes the video. The queue handles 20 eligible posts per run in batches of five.
- The worker rechecks the paid plan before preparation and publication. Expired plans produce a visible failure; renewal does not silently publish missed posts. Users explicitly retry. Requests whose publication is uncertain only reconcile status, even after downgrade.

Additional checks:

```sh
node --import tsx --test tests/instagram.test.ts tests/instagram-scheduling.test.ts
TEST_APP_URL=http://localhost:3000 node --env-file=.env --import tsx scripts/test-instagram-integration.ts
TEST_APP_URL=http://localhost:3000 node scripts/test-instagram-ui.mjs
```

Verification completed October 12: production `next build`, TypeScript, targeted ESLint, 35 unit tests, desktop/mobile browser checks, and real HTTP/Supabase integration checks passed. Integration checks use temporary paid-plan fixtures and mocked Instagram responses; all temporary users are deleted afterward. They also verify Starter API denial, authenticated cron protection, future scheduling, cancellation after downgrade, expiry before execution, and manual captions.
