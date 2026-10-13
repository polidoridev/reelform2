import { ApiError } from "@/lib/http";
import { instagramConfig, INSTAGRAM_SCOPES, validInstagramId } from "./security";

export class InstagramError extends ApiError {
  constructor(public code?: number) {
    super(
      code === 190
        ? "Your Instagram connection expired. Reconnect to continue."
        : code === 10 || code === 200
          ? "Instagram publishing permission is missing. Reconnect your Creator or Business account."
          : code === 4 || code === 32 || code === 613
            ? "Instagram’s request limit was reached. Try again later."
            : "Instagram could not complete this request. Check your account and video, then try again.",
      502,
    );
  }
}
async function request<T>(url: string | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new ApiError(
      "Instagram did not respond. Check the publishing status before trying again.",
      504,
    );
  }
  const data = (await response.json().catch(() => null)) as
    (T & { error?: { code?: number } }) | null;
  if (!response.ok || data?.error) throw new InstagramError(data?.error?.code);
  if (!data)
    throw new ApiError("Instagram returned an incomplete response.", 502);
  return data as T;
}
export function graph<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  method = "GET",
) {
  const url = new URL(
    `https://graph.instagram.com/${instagramConfig().version}/${path}`,
  );
  if (method === "GET") url.search = new URLSearchParams(params).toString();
  return request<T>(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    ...(method === "GET" ? {} : { body: new URLSearchParams(params) }),
  });
}
export function authorizationUrl(state: string) {
  const config = instagramConfig();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
    enable_fb_login: "0",
    force_authentication: "1",
  }).toString();
  return url.toString();
}
type Token = { access_token: string; expires_in: number };
function validToken(value: Token) {
  if (
    typeof value.access_token !== "string" ||
    !value.access_token.trim() ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0 ||
    !Number.isFinite(new Date(Date.now() + value.expires_in * 1000).getTime())
  )
    throw new ApiError("Instagram returned an incomplete connection.", 502);
  return value;
}
export async function exchangeCode(code: string) {
  const config = instagramConfig();
  type ShortToken = {
    access_token: string;
    user_id: string | number;
    permissions?: string | string[];
  };
  const response = await request<ShortToken & { data?: ShortToken[] }>(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
        code,
      }),
    },
  );
  const short = response.data?.[0] ?? response;
  const permissions = Array.isArray(short.permissions)
    ? short.permissions
    : (typeof short.permissions === "string"
        ? short.permissions.split(",").map((scope) => scope.trim())
        : []);
  if (
    typeof short.access_token !== "string" ||
    !short.access_token.trim() ||
    !INSTAGRAM_SCOPES.every((scope) => permissions.includes(scope))
  )
    throw new ApiError(
      "Allow both profile access and publishing to connect Instagram.",
      400,
    );
  if (
    !validInstagramId(short.user_id)
  )
    throw new ApiError("Instagram returned an incomplete connection.", 502);
  const url = new URL("https://graph.instagram.com/access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.appSecret,
    access_token: short.access_token,
  }).toString();
  const token = validToken(await request<Token>(url));
  const profile = await graph<{
    user_id: string;
    username: string;
    account_type: string;
  }>("me", token.access_token, { fields: "user_id,username,account_type" });
  if (
    !validInstagramId(profile.user_id) ||
    typeof profile.username !== "string" ||
    !profile.username.trim() ||
    typeof profile.account_type !== "string" ||
    !["BUSINESS", "MEDIA_CREATOR"].includes(
      (profile.account_type || "").toUpperCase(),
    )
  )
    throw new ApiError("Connect an Instagram Creator or Business account.");
  return {
    ...token,
    instagram_user_id: String(profile.user_id),
    app_scoped_id: String(short.user_id),
    username: profile.username,
  };
}
export async function refreshToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: token,
  }).toString();
  return validToken(await request<Token>(url));
}
export function safePermalink(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
