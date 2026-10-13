import { admin, checked } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
import { canPublishInstagram } from "./scheduling";

export async function instagramAccess(user: string) {
  const { data } = await checked(
    admin()
      .from("rf_accounts")
      .select("plan,paid_until")
      .eq("user_id", user)
      .maybeSingle(),
  );
  return canPublishInstagram(data);
}

export async function requireInstagramAccess(user: string) {
  if (!(await instagramAccess(user)))
    throw new ApiError(
      "Instagram publishing requires an active Pro or Studio subscription.",
      403,
    );
}
