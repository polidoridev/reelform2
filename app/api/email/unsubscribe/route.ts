import { unsubscribe } from "@/lib/commerce/email";
export async function POST(request: Request) {
  const url = new URL(request.url);
  // Mail providers' one-click unsubscribe (RFC 8058) expects a plain response. The
  // unsubscribe page's form is a browser navigation, so send it back to a styled page.
  const browser =
    request.headers.get("sec-fetch-mode") === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
  let ok = true;
  try {
    await unsubscribe(url.searchParams.get("token") || "");
  } catch {
    ok = false;
  }
  if (browser)
    return new Response(null, {
      status: 303,
      headers: { Location: `/unsubscribe?result=${ok ? "done" : "invalid"}`, "Cache-Control": "no-store" },
    });
  return ok
    ? new Response("Unsubscribed.", { headers: { "Cache-Control": "no-store" } })
    : new Response("Invalid or expired unsubscribe link.", { status: 400 });
}
