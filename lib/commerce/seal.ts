import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/http";
function secret() {
  const key = process.env.APP_SIGNING_SECRET;
  if (!key) throw new ApiError("Secure account configuration is missing.", 503);
  return key;
}
export function seal(payload: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${createHmac("sha256", secret()).update(value).digest("base64url")}`;
}
export function unseal(token: string) {
  const [payload, mac, ...extra] = token.split(".");
  if (!payload || !mac || extra.length || token.length > 16000)
    throw new ApiError("This link is invalid or expired.");
  const signature = createHmac("sha256", secret()).update(payload).digest();
  const supplied = Buffer.from(mac, "base64url");
  if (
    signature.length !== supplied.length ||
    !timingSafeEqual(signature, supplied)
  )
    throw new ApiError("This link is invalid or expired.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (typeof data.exp !== "number" || data.exp < Date.now())
    throw new ApiError("This link has expired.");
  return data;
}
