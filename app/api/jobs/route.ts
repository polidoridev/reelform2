import { authorize, verify } from "@/lib/higgsfield";
import { ApiError, errorResponse, noStore } from "@/lib/http";
import { admin, checked } from "@/lib/supabase/server";
import { balances } from "@/lib/commerce/billing";
import { refreshJob } from "@/lib/commerce/jobs";
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const token = new URL(request.url).searchParams.get("token");
    if (!token) throw new ApiError("A generation link is required.");
    const signed = await verify(token, user, "job");
    const { data: job } = await checked(
      admin()
        .from("rf_jobs")
        .select("*")
        .eq("id", signed.id)
        .eq("user_id", user)
        .maybeSingle(),
    );
    if (!job) throw new ApiError("Generation not found.", 404);
    const result = await refreshJob(job);
    return noStore({
      status: result.status,
      videoUrl: result.result_url,
      error: result.error,
      credits: result.credits,
      ...(["completed", "failed"].includes(result.status)
        ? { balance: (await balances(user)).total }
        : {}),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
