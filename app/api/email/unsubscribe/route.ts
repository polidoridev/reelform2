import { unsubscribe } from "@/lib/commerce/email";
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    await unsubscribe(url.searchParams.get("token") || "");
    return new Response("Unsubscribed.", {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return new Response("Invalid or expired unsubscribe link.", {
      status: 400,
    });
  }
}
