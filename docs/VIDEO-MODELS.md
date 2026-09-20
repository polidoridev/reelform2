# Reelform video model catalog

Verified 2026-09-20. The studio remains an uploaded-video workflow. It offers 13 compatible editing, motion-transfer, and video-reference configurations. Text-only/image-only endpoints are deliberately excluded; those require separate creation modes. This is a curated integration catalog, not a promise to cover every future Higgsfield endpoint.

The first five are editorial recommendations for this product, not a measured benchmark: Seedance 2.5 Edit, Kling O3 Edit, Genjutsu Object Swap, Genjutsu Motion Transfer, Kling 3.0 Motion Pro. The default remains Seedance 2.5 Edit. Best results depend on the footage and task.

## Contract and pricing

- Seedance 2.5 Edit: 480p/720p only. 4–30 seconds. Existing token formula retained.
- Seedance reference generation rounds output duration up to a whole second and can change motion/timing. Seedance 2.0 supports 1080p with a 15-second ceiling; 2.5 supports up to 30 seconds at 720p.
- Kling Edit/Reference maps 720p to `std`, 1080p to `pro`. Reelform limits source clips to 10 seconds for those adapters. Motion Pro uses the Pro endpoint; Standard uses Standard. Motion requires exactly one reference photo and uses video orientation.
- Genjutsu requires a reference image. Undiscounted rates are $0.318/s at 480p and $0.681/s at 720p, input seconds rounded up.
- Kling undiscounted per-second rates: edits $0.126; reference $0.168 (conservative rate); motion 3 Pro $0.168, 3 Standard $0.126, 2.6 Pro $0.112, 2.6 Standard $0.070. Round billed seconds up.
- Seedance 2.0 with video reference: $0.0084/1,000 tokens. Input and output seconds are both counted. Seedance 2.5 uses $0.01284/1,000. Reference adapter aspect ratio is 16:9, 9:16, or square; pricing uses the same dimensions.
- No promotional discounts assumed. Existing credit margin is retained. Admin zero-credit access is checked on the server.
- Quotes bind model and resolution. The persisted job input stores the model, and retries submit the persisted input/model. Model-specific limits are validated before a reservation.
- Source audio is stripped in MOV preparation. Only Seedance adapters expose generated audio; other adapters submit silent/no-original-sound requests.

## Sources

- https://dash.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/llms.txt
- https://dash.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/llms.txt
- https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/playground
- https://dash.higgsfield.ai/models/kling-video/o3/video-edit/llms.txt
- https://dash.higgsfield.ai/models/kling-video/omni/video-edit/llms.txt
- https://dash.higgsfield.ai/models/kling-video/o3/video-reference/llms.txt
- https://dash.higgsfield.ai/models/kling-video/omni/video-reference/llms.txt
- https://open.higgsfield.ai/models/kling-video/v3/motion-control/pro/playground
- https://higgsfield.ai/blog/kling-motion-control-3
- https://open.higgsfield.ai/models/higgsfiled/genjutsu/motion-transfer/v1.0/playground
- https://dash.higgsfield.ai/models/higgsfiled/genjutsu/object-swap/v1.0/llms.txt

## Validation boundary

Adapter and quote unit tests cover all configurations. Deliberately invalid input requests returned schema-validation errors from all 13 endpoints with the configured credentials; no paid generations were submitted. Output quality and model-specific codec handling still require real generation trials. Do not present these schema checks as successful end-to-end generation tests.
