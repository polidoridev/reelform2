# Saved generation chats

Sending keeps the prompt, source video, and reference photos in the composer. Each confirmed generation has an owned `/studio?generation=<job-id>` address. While the send response is outstanding, `/studio?request=<client-id>` recovers the same reservation by its idempotency key. Refreshing never starts another generation automatically.

My creations links both the preview and prompt to the saved chat. Reopening restores the current generation, its original inputs, model, resolution, sound, shape/duration for prompt-only creation, and up to 50 preceding turns. New generations record the previous owned job ID in `rf_jobs.input.parentJobId`. Older generations without that relationship reopen as a single turn.

Before the provider submission, the generation route streams verified input files into the existing private `reelform-uploads` bucket. Job-specific flat paths (`<user>/job-<job>-<slot>.<ext>`) and a `savedInputs` manifest in `rf_jobs.input` preserve names, ordering, type, and size. These files are independent of upload-library pruning/deletion. Existing account deletion removes them along with the other files in the user's prefix. No database migration is required.

Input-saving failures before provider submission fail the job and return reserved credits. Once provider submission may have happened, the existing unknown-status hold still prevents duplicate submissions. Saved files never enter a public bucket.

Both chat reads and input playback require a verified user and filter by job owner. Every ancestor is independently owner-checked. Input routes return one-hour signed storage URLs with private/no-store caching. Background chat session data is namespaced by account. Login redirect handling allows only valid generation/request UUIDs, preserving the saved chat across sign-in.

Opening an older generation tries to archive its originals from the provider or upload library. If both copies have already expired or been deleted, the prompt/result remain visible and the studio explains that an original is unavailable; those missing bytes cannot be recreated. New generations archive originals before submission.

Verification:

- `npx tsx --test tests/generation-inputs.test.ts tests/auth-destination.test.ts`: private streaming, bounded source validation, manifest ordering and safe login destinations.
- `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-saved-chats.mjs`: mocked-provider browser flow covering retained composer, refresh during generation, both reference images, history, My creations, lost responses, and mobile layout.
- `node --env-file=.env --import tsx scripts/test-saved-chat-access.ts`: temporary live QA accounts and a tiny private input, cleaned up afterward. Verifies owned chat retrieval, client-ID recovery, stored bytes, denied anonymous/other-user access, and ancestry filtering. Does not invoke a generation provider or payment service.
