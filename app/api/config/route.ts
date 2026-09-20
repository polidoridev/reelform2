import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from "@/lib/video-models";
import { currentUser } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/higgsfield";
import { billingEnabled } from "@/lib/commerce/stripe";
import { noStore } from "@/lib/http";
export async function GET() {
  return noStore({
    ready: isConfigured(),
    authenticated: !!(await currentUser()),
    model: DEFAULT_VIDEO_MODEL,
    models: VIDEO_MODELS.map(({ id, name, resolutions }) => ({ id, name, resolutions })),
    billingReady: billingEnabled(),
  });
}
