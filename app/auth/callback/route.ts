import { cookies } from "next/headers";
import { authDestination } from "@/lib/auth-destination";
import { appUrl } from "@/lib/http";
import { authClient, accountFor } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const jar = await cookies();
  const next = authDestination(jar.get("rf-auth-next")?.value);
  jar.delete("rf-auth-next");
  let destination = `/login?error=google&next=${encodeURIComponent(next)}`;
  if (code && !url.searchParams.has("error")) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await accountFor(data.user);
        destination = next;
      }
    } catch {
      // Never expose provider errors, authorization codes, or tokens in the UI.
    }
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(destination, appUrl()).toString(),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
