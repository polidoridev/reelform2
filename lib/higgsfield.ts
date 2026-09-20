import { requireUser } from "@/lib/supabase/server";
import { ApiError } from "@/lib/http";
export { ApiError, readJson, errorResponse } from "@/lib/http";

const API = "https://api.higgsfield.ai";
export const MODEL = "bytedance/seedance-2.5/video-edit";
function credentials() {
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret)
    throw new ApiError(
      "Generation is not connected yet. The site owner needs to add the Higgsfield API credentials.",
      503,
    );
  return `${id}:${secret}`;
}
export function isConfigured() {
  return Boolean(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);
}
export async function authorize(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError("This request must come from Reelform.", 403);
  const user = await requireUser(request);
  return user.id;
}
export async function provider<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}/${path}`, {
      ...init,
      headers: {
        Authorization: `Key ${credentials()}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "The video service did not respond in time. A submitted generation may still be processing. Check your Reelform account before trying again.",
      504,
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new ApiError(
        "Video generation is temporarily unavailable. Please contact Reelform support.",
        502,
        true,
      );
    if (response.status === 402)
      throw new ApiError(
        "Video generation is temporarily unavailable. Please contact Reelform support.",
        402,
        true,
      );
    if (response.status === 429)
      throw new ApiError(
        "Higgsfield is receiving too many requests. Please wait a moment and try again.",
        429,
        true,
      );
    if (response.status === 404)
      throw new ApiError(
        "This generation could not be found in Higgsfield.",
        404,
        true,
      );
    throw new ApiError(
      "Higgsfield could not process this request. Check your input files and try a shorter, simpler clip.",
      502,
      response.status >= 400 && response.status < 500,
    );
  }
  if (!data || typeof data !== "object")
    throw new ApiError("Higgsfield returned an unexpected response.", 502);
  return data as T;
}
async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.APP_SIGNING_SECRET || credentials()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const decode = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
export async function sign(data: Record<string, unknown>) {
  const payload = encode(new TextEncoder().encode(JSON.stringify(data)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function verify(token: string, user: string, kind: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || token.length > 12000) throw new Error();
    const [payload, signature] = parts;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decode(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) throw new Error();
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (
      data.user !== user ||
      data.kind !== kind ||
      typeof data.exp !== "number" ||
      data.exp < Date.now()
    )
      throw new Error();
    return data;
  } catch {
    throw new ApiError(
      "This upload or generation link has expired. Please start again.",
      400,
    );
  }
}
