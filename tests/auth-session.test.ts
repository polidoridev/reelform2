import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("page session refresh persists cookies without writing during render", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://session-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  const cookieName = "sb-session-test-auth-token";
  const user = { id: "test-user", email_confirmed_at: "2026-01-01T00:00:00Z" };
  const expired = {
    access_token: "expired-access-token", refresh_token: "old-refresh-token",
    expires_at: 1, expires_in: 3600, token_type: "bearer", user,
  };
  const cookie = `${cookieName}=base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`;
  try {
    await t.test("anonymous pages need no auth network request", async () => {
      globalThis.fetch = async () => { throw new Error("Unexpected auth request"); };
      const response = await proxy(new NextRequest("https://reelform.test/login"));
      assert.equal(response.status, 200);
      assert.equal(response.cookies.getAll().length, 0);
    });

    for (const valid of [false, true]) {
      await t.test(valid ? "refreshes expired sessions" : "clears revoked sessions", async () => {
        let refreshes = 0;
        globalThis.fetch = async (input) => {
          const url = String(input);
          if (url.includes("/auth/v1/token?grant_type=refresh_token")) {
            refreshes++;
            return valid
              ? Response.json({ ...expired, access_token: "new-access-token", refresh_token: "new-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600 })
              : Response.json({ code: "refresh_token_not_found", msg: "Refresh token not found" }, { status: 400 });
          }
          assert.ok(valid && url.endsWith("/auth/v1/user"), `Unexpected auth request: ${url}`);
          return Response.json(user);
        };
        const request = new NextRequest("https://reelform.test/login", { headers: { cookie } });
        const response = await proxy(request);
        assert.equal(refreshes, 1);
        const stored = response.cookies.get(cookieName);
        assert.ok(stored);
        assert.equal(request.cookies.get(cookieName)?.value, stored.value);
        assert.ok(response.headers.get("x-middleware-request-cookie")?.includes(`${cookieName}=${stored.value}`));
        assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
        if (valid) {
          const session = JSON.parse(Buffer.from(stored.value.slice(7), "base64url").toString());
          assert.equal(session.access_token, "new-access-token");
          assert.equal(session.refresh_token, "new-refresh-token");
        } else {
          assert.equal(stored.value, "");
          assert.equal(stored.maxAge, 0);
        }
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  }
});
