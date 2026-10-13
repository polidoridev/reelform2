import { z } from "zod";
import { requireUser, admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { sign } from "@/lib/higgsfield";
import { DEFAULT_VIDEO_MODEL, type AspectRatio } from "@/lib/video-models";
import { archiveGenerationInputs, inputAssets, type GenerationInput } from "@/lib/commerce/generation-inputs";
import type { SavedGeneration } from "@/lib/commerce/generation-chat";

export const maxDuration = 300;

type Row = { id: string; user_id: string; prompt: string; resolution: string; status: string; created_at: string; result_url: string | null; error: string | null; input: GenerationInput };
function serialize(row: Row): SavedGeneration {
  return { id: row.id, prompt: row.prompt, model: row.input.model || DEFAULT_VIDEO_MODEL, resolution: row.resolution, generateAudio: !!row.input.generateAudio, trial: row.input.trial === true, aspectRatio: row.input.aspectRatio as AspectRatio | undefined, duration: row.input.media?.duration ?? 5, status: row.status, createdAt: row.created_at, result: row.result_url, error: row.error, assets: inputAssets(row) };
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) throw new ApiError("Chat not found.", 404);
    const db = admin();
    const field = new URL(request.url).searchParams.get("lookup") === "client" ? "client_id" : "id";
    const { data: job } = await checked(db.from("rf_jobs").select("*").eq(field, id).eq("user_id", user.id).maybeSingle());
    if (!job) throw new ApiError("Chat not found.", 404);
    // Backfill originals for older generations when their provider or library copy
    // still exists. A missing legacy upload must not hide the prompt or result.
    if (!job.input.savedInputs && !["reserved", "submitting"].includes(job.status)) {
      try { job.input = await archiveGenerationInputs(job); }
      catch { /* Individual input routes can still try the older copy. */ }
    }
    const history: SavedGeneration[] = [];
    const visited = new Set<string>([job.id]);
    let parent = job.input?.parentJobId;
    // Bound traversal and scope every ancestor to the same signed-in owner.
    while (parent && !visited.has(parent) && history.length < 50) {
      visited.add(parent);
      const { data } = await checked(db.from("rf_jobs").select("*").eq("id", parent).eq("user_id", user.id).maybeSingle());
      if (!data) break;
      history.unshift(serialize(data));
      parent = data.input?.parentJobId;
    }
    return noStore({ generation: serialize(job), history, token: await sign({ user: user.id, kind: "job", id: job.id, exp: Date.now() + 30 * 86400000 }) });
  } catch (error) { return errorResponse(error); }
}
