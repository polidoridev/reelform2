# Private video library

Run `node --env-file=.env --import=tsx scripts/setup-video-library.ts` to provision the private `reelform-creations` bucket on a new environment. No public/authenticated object policies are needed: the backend manages objects with its service credential. Never make this bucket public.

Completed generations are copied from Higgsfield to `<user-id>/<job-id>.mp4`. The job's persisted result URL becomes `/api/videos/<job-id>`. That route authenticates the request, checks job ownership, and issues a one-hour signed playback/download URL. Account deletion removes the user's archived objects before deleting Auth.

The current bucket limit is 50 MiB per generated output (separate from the 1 GiB source-upload limit). If archival fails or an output exceeds that limit, the original provider link is retained and My creations displays “Private backup pending. Download a copy now.” Account/status refreshes retry archival. Do not claim these exceptional files have been durably saved. Increasing the cap requires checking the project's global Storage limit first.

Existing completed generations were backfilled on 2026-09-20. Both copies were verified by size and signed playback; anonymous reads were denied. Pending generations finish through studio polling, account refresh, or the existing maintenance worker. My creations currently lists the latest 50 job records; older records and archived objects are not deleted by that display limit.
