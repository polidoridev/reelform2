import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ApiError } from "@/lib/http";

export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];
export const OAUTH_COOKIE = "rf_instagram_oauth";
export function instagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  const version = process.env.INSTAGRAM_API_VERSION || "v25.0";
  const key = Buffer.from(process.env.INSTAGRAM_TOKEN_KEY || "", "base64");
  if (
    process.env.INSTAGRAM_ENABLED !== "true" ||
    !appId ||
    !appSecret ||
    !redirectUri ||
    key.length !== 32 ||
    !/^v\d+\.\d+$/.test(version)
  )
    throw new ApiError("Instagram publishing isn’t available yet.", 503);
  const callback = URL.parse(redirectUri);
  if (
    !callback ||
    callback.protocol !== "https:" ||
    callback.pathname !== "/api/instagram/callback" ||
    callback.search ||
    callback.hash ||
    callback.username ||
    callback.password
  )
    throw new ApiError("Instagram publishing isn’t available yet.", 503);
  return {
    appId,
    appSecret,
    redirectUri,
    version,
    key,
    origin: callback.origin,
  };
}
export function instagramConfigured() {
  try {
    instagramConfig();
    return true;
  } catch {
    return false;
  }
}
export const stateHash = (state: string) =>
  createHash("sha256").update(state).digest("hex");
export const newState = () => randomBytes(32).toString("base64url");
export function matchesState(state: string | null, cookie: string | undefined) {
  if (
    !state ||
    !cookie ||
    !/^[\w-]{43}$/.test(state) ||
    !/^[\w-]{43}$/.test(cookie) ||
    state.length !== cookie.length
  )
    return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(cookie));
}
export function encryptToken(token: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", instagramConfig().key, iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptToken(value: string, owner: string) {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra)
    throw new ApiError("Reconnect Instagram to continue.", 409);
  try {
    const cipher = createDecipheriv(
      "aes-256-gcm",
      instagramConfig().key,
      Buffer.from(iv, "base64url"),
      { authTagLength: 16 },
    );
    if (Buffer.from(iv, "base64url").length !== 12)
      throw new Error("Invalid token IV");
    cipher.setAAD(Buffer.from(owner));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      cipher.update(Buffer.from(encrypted, "base64url")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiError("Reconnect Instagram to continue.", 409);
  }
}
export function verifySignedRequest(value: string) {
  const [signature, payload, extra] = value.split(".");
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!secret || !signature || !payload || extra || value.length > 16000)
    throw new ApiError("Invalid Instagram request.", 403);
  const expected = createHmac("sha256", secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new ApiError("Invalid Instagram request.", 403);
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new ApiError("Invalid Instagram request.", 403);
  }
  if (data?.algorithm !== "HMAC-SHA256" || !validInstagramId(data.user_id))
    throw new ApiError("Invalid Instagram request.", 403);
  return String(data.user_id);
}

// Meta IDs can exceed JavaScript's integer precision. Never accept a rounded ID.
export function validInstagramId(value: unknown): value is string | number {
  return (
    (typeof value === "string" && /^\d+$/.test(value)) ||
    (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
  );
}
