# Reelform video model catalog

Verified 2026-09-27. The studio remains an uploaded-video workflow. It offers 13 compatible editing, motion-transfer, and video-reference configurations. Text-only/image-only endpoints are deliberately excluded; those require separate creation modes. This is a curated integration catalog, not a promise to cover every future Higgsfield endpoint.

Inputs: Genjutsu requires a video and at least one photo. Seedance 2.5 Create and Seedance 2.0 Create (ids `seedance-2.5-reference` and `seedance-2-reference`, kept for existing jobs) are video-optional: with a video they call reference-to-video as before; with only photos they call reference-to-video with `image_urls`, the chosen `aspect_ratio`, and `duration`; with neither they call `…/text-to-video`. Edit, reference (Kling), and motion models transform a supplied video and still require one. Kling 2.5 Turbo Pro also has text/image-to-video endpoints but no published price, so it is not offered.

Genjutsu Motion Transfer and Genjutsu Object Swap are the two featured one-click choices in the studio; Object Swap is the default. The remaining models are listed in the order of `VIDEO_MODELS`, an editorial ranking for this product rather than a measured benchmark, each with a `bestFor` explanation shown in the model list. Best results depend on the footage and task.

## Contract and pricing

- Seedance 2.5 Edit: 480p, 720p, and 1080p. 4–30 seconds. $0.01284/1,000 tokens at 480p/720p and $0.01404/1,000 at 1080p (video-input rate). The docs' parameter table still lists 480p/720p only, but the JSON schema, pricing, and schema validation accept 1080p.
- Seedance reference generation rounds output duration up to a whole second and can change motion/timing. Seedance 2.0 supports 1080p with a 15-second ceiling; 2.5 supports 1080p up to 30 seconds (same token rates as 2.5 Edit).
- Kling Edit/Reference maps 720p to `std`, 1080p to `pro`. Reelform limits source clips to 10 seconds for those adapters. Motion Pro uses the Pro endpoint; Standard uses Standard. Motion requires exactly one reference photo and uses video orientation.
- Genjutsu requires a reference image (the API accepts up to 8; plans cap Reelform at 4). Undiscounted rates are $0.318/s at 480p, $0.681/s at 720p, and $1.632/s at 1080p, input seconds rounded up. The documented endpoints are `higgsfield/genjutsu/…`; the misspelled `higgsfiled/…` path used previously is still accepted.
- Kling undiscounted per-second rates: edits $0.126; reference $0.168 (conservative rate); motion 3 Pro $0.168, 3 Standard $0.126, 2.6 Pro $0.112, 2.6 Standard $0.070. Round billed seconds up.
- Created without a video, Seedance bills only generated seconds at the no-video rate: 2.5 $0.0214/1,000 tokens at 480p/720p and $0.0234 at 1080p; 2.0 $0.014. Output size follows the chosen shape with the short side at the selected quality (`quoteCreation`). No original audio exists to restore, so `preserveOriginalAudio` is false.
- Seedance 2.0 with video reference: $0.0084/1,000 tokens. Input and output seconds are both counted. Seedance 2.5 uses $0.01284/1,000. Reference adapter aspect ratio is 16:9, 9:16, or square; pricing uses the same dimensions.
- No promotional discounts assumed. Existing credit margin is retained. Admin zero-credit access is checked on the server.
- Quotes bind model and resolution. The persisted job input stores the model, and retries submit the persisted input/model. Model-specific limits are validated before a reservation.
- Prompts may mention `@video` and `@image1`…`@imageN` (numbered in upload order). `lib/prompt-references.ts` rejects mentions without a matching photo and rewrites them to plain wording (“the input video”, “reference image 2”) before submission, because Higgsfield documents no mention syntax for these models. The stored prompt keeps the person's own wording.
- Source audio is stripped in MOV preparation. Only Seedance adapters expose generated audio; other adapters submit silent/no-original-sound requests.

## Sources

- https://dash.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/llms.txt
- https://dash.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/llms.txt
- https://dash.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/llms.txt
- https://dash.higgsfield.ai/models/bytedance/seedance-2.0/text-to-video/llms.txt
- https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/playground
- https://dash.higgsfield.ai/models/kling-video/o3/video-edit/llms.txt
- https://dash.higgsfield.ai/models/kling-video/omni/video-edit/llms.txt
- https://dash.higgsfield.ai/models/kling-video/o3/video-reference/llms.txt
- https://dash.higgsfield.ai/models/kling-video/omni/video-reference/llms.txt
- https://open.higgsfield.ai/models/kling-video/v3/motion-control/pro/playground
- https://higgsfield.ai/blog/kling-motion-control-3
- https://dash.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/llms.txt
- https://dash.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/llms.txt

## Validation boundary

Adapter and quote unit tests cover all configurations. Deliberately invalid input requests returned schema-validation errors from all 13 endpoints with the configured credentials; no paid generations were submitted. On 2026-09-27, schema validation confirmed 1080p for both Genjutsu models and both Seedance 2.5 models, and one paid 5-second 480p Genjutsu Motion Transfer generation completed end to end. Output quality at 1080p and the other models' codec handling still require real generation trials. Do not present these schema checks as successful end-to-end generation tests.
