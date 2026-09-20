import { authClient, accountFor } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let destination = "/login?error=google";
  if (code && !url.searchParams.has("error")) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await accountFor(data.user);
        destination = "/account";
      }
    } catch {
      // Never expose provider errors, authorization codes, or tokens in the UI.
    }
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(destination, url.origin).toString(),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
