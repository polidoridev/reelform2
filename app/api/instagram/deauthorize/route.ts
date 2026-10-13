import { admin, checked } from "@/lib/supabase/server";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { verifySignedRequest } from "@/lib/instagram/security";
import { disconnectInstagram } from "@/lib/instagram/server";
export async function POST(request: Request) {
  try {
    if (
      !request.headers
        .get("content-type")
        ?.includes("application/x-www-form-urlencoded")
    )
      throw new ApiError("Invalid Instagram request.", 415);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError("Invalid Instagram request.");
    let text = "";
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        if (text.length > 20000) throw new ApiError("Request too large.", 413);
      }
    } finally {
      await reader.cancel();
    }
    const id = verifySignedRequest(
      new URLSearchParams(text).get("signed_request") || "",
    );
    const { data } = await checked(
      admin()
        .from("rf_instagram_connections")
        .select("user_id")
        .eq("app_scoped_id", id),
    );
    for (const row of data || []) await disconnectInstagram(row.user_id);
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
