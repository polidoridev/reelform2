import { z } from "zod";
import { requireUser, admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse } from "@/lib/http";
import { generationInputUrl } from "@/lib/commerce/generation-inputs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const user = await requireUser(request);
    const { id, slot } = await params;
    if (!z.string().uuid().safeParse(id).success || !/^(video|image-[1-4])$/.test(slot)) throw new ApiError("Original upload not found.", 404);
    const { data: job } = await checked(admin().from("rf_jobs").select("id,user_id,input").eq("id", id).eq("user_id", user.id).maybeSingle());
    if (!job) throw new ApiError("Original upload not found.", 404);
    return new Response(null, { status: 302, headers: { Location: await generationInputUrl(job, slot), "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
