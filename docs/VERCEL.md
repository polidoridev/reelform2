# Vercel deployment

`vercel.json` selects the Next.js framework and runs `npm run build:vercel`
(`next build`), producing `.next`. The default `npm run build` remains the
Sites/Cloudflare build and produces `dist`; that output cannot be deployed
with Vercel's Next.js adapter.

Import `polidoridev/reelform2` with the repository root as the project root.
The checked-in configuration overrides the build command and output directory.
Configure application environment variables in Vercel using `.env.example`
as the variable-name checklist. Secrets are not included in GitHub.
Keep billing disabled until the live Stripe configuration and webhooks are
verified; see `LAUNCH.md` for the remaining launch requirements.

Local production-build check: `npm run build:vercel`.
