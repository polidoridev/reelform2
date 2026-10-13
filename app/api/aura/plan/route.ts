import { currentUser, requireUser, admin } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore, readJson } from "@/lib/http";
import { auraAiRequestSchema } from "@/lib/aura-ai";
import { auraAiEnabled, auraAiLimit, requestAuraAiPlan } from "@/lib/aura-ai-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return noStore({ enabled: auraAiEnabled(), authenticated: Boolean((await currentUser())?.email_confirmed_at) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!auraAiEnabled()) throw new ApiError("AI editing is not connected yet. You can still use the manual editor.", 503);
    const parsed = auraAiRequestSchema.safeParse(await readJson(request, 1_800_000));
    if (!parsed.success) throw new ApiError("The clips or instructions could not be read. Add valid clips and try again.");
    const { data, error } = await admin().rpc("rf_reserve_aura_ai", {
      p_user: user.id,
      p_daily_limit: auraAiLimit("AURA_AI_DAILY_LIMIT", 10),
      p_global_limit: auraAiLimit("AURA_AI_GLOBAL_DAILY_LIMIT", 200),
    });
    if (error) throw new ApiError("AI editing is temporarily unavailable. Please use the manual editor.", 503);
    if (data !== true) throw new ApiError("The AI planning limit has been reached. Please try later or use the manual editor.", 429);
    const plan = await requestAuraAiPlan(parsed.data, request.signal);
    return noStore({ plan });
  } catch (error) { return errorResponse(error); }
}
