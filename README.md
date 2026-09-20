# Reelform

A Tiffany blue and white AI video transformation website, inspired by the media-led Viewmax layout. Includes an original Higgsfield-generated video gallery and a working studio interface.

## Run locally

```sh
npm install
npm run dev -- --port 3000
```

Visit the URL printed by the server. This project uses React 19, TypeScript, the Next.js App Router conventions, and Vinext/Vite on Cloudflare Workers. The Sites starter supplies local authentication and private hosting.

## Connect real video transformations

Create credentials and fund the **API account** at https://console.higgsfield.ai/. Higgsfield subscription/MCP credits and API billing are separate. Put these in the ignored `.env` file:

```dotenv
HF_API_KEY_ID=your_key_id
HF_API_KEY_SECRET=your_key_secret
```

Restart the dev server after editing `.env`. For hosted use, configure the same two values as server-only secrets in Sites settings. No OpenAI key is needed. Local signed-in generation uses the starter's `/signin-with-chatgpt?return_to=/studio` flow; private hosting supplies the authenticated identity. Do not expose this implementation publicly without configuring appropriate authorization, quotas, and billing for your users.

### Integration

- The browser requests an authorized presigned upload from `/api/uploads`, then uploads file bytes directly to Higgsfield storage. Large videos do not pass through the app server's memory.
- The server signs each uploaded media reference and binds it to the authenticated user; clients cannot submit arbitrary URLs as approved uploads.
- `/api/generate` validates inputs and calls `bytedance/seedance-2.5/video-edit` with `video_url`, optional `image_urls`, prompt, resolution and audio settings.
- `/api/jobs` verifies a user-bound signed job token before reading the provider's job status. Credentials stay on the server.
- The current tab saves only its signed active-job reference in session storage, allowing a reload to resume polling. Higgsfield is the source of truth for generation status. This is not a durable project library.
- Status checks have backoff and bounded retries. Generation POST requests are not retried automatically: an ambiguous timeout may already have created a billable provider job.
- Downloads use the returned provider URL. Download promptly; provider media retention policies apply. Files are sent to Higgsfield only after the user chooses to generate.

Supported input: MP4, 4–30 seconds, up to 100 MB; up to four JPG/PNG/WebP reference images, 10 MB each. Outputs: 480p or 720p, with optional generated audio. Input duration is validated in the browser. Server validation covers declared file sizes, types, prompt, signed media provenance, and ownership; it does not inspect uploaded video bytes. For a public paid service, add trusted media inspection, durable jobs, account billing, rate limiting, and retention/deletion policies.

## Demo assets

Original examples in `public/media` were created through Higgsfield with Seedance 2.5. They are clearly labeled as concept scenes, not before-and-after transformations. See `public/media/provenance.json` for generation IDs. The studio can preview examples without API credentials; it never substitutes a demo for a user-generated result.

## Verify

```sh
npx tsc --noEmit
npx --yes tsx --test tests/api-security.test.ts
npm run build
```

The landing page and studio are responsive, include keyboard focus states, upload validation, reduced-motion support, and truthful missing-configuration states. Real app-side generation requires configured API credentials and has not been exercised against a funded API account during initial implementation.

## Official references

- https://docs.higgsfield.ai/docs/llms.txt
- https://docs.higgsfield.ai/docs/concepts/file-uploads.md
- https://console.higgsfield.ai/models/bytedance%2Fseedance-2.5%2Fvideo-edit/api-reference
- https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status.md
