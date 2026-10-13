import { timingSafeEqual } from "node:crypto";
import { maintainInstagram } from "@/lib/instagram/server";
import { errorResponse, noStore } from "@/lib/http";

export const maxDuration = 300;
export async function GET(request: Request) {
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    await maintainInstagram();
    return noStore({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
