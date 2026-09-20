import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const base = process.env.TEST_APP_URL || "http://localhost:3000",
  db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
const email = `qa-auth-${randomUUID()}@example.invalid`,
  password = `aA8!${randomUUID()}`,
  jar = new Map<string, string>();
let id = "";
async function call(
  path: string,
  body?: unknown,
  origin = base,
  method = "POST",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of r.headers.getSetCookie()) {
    const first = c.split(";")[0],
      at = first.indexOf("=");
    jar.set(first.slice(0, at), first.slice(at + 1));
  }
  return r;
}
try {
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  id = created.data.user.id;
  assert.equal(
    (await call("/api/account", undefined, base, "GET")).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/auth/login",
        { email, password },
        "https://attacker.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/auth/login", { email, password })).status,
    200,
  );
  assert.equal(
    (await call("/api/account", undefined, base, "GET")).status,
    200,
  );
  console.log(
    "PASS HTTP login issues working Supabase cookies; anonymous and cross-origin requests rejected",
  );
  assert.equal(
    (
      await call(
        "/api/account",
        { action: "profile", name: "Verified QA" },
        base,
        "PATCH",
      )
    ).status,
    200,
  );
  const account = (await (
    await call("/api/account", undefined, base, "GET")
  ).json()) as { account: { full_name: string } };
  assert.equal(account.account.full_name, "Verified QA");
  assert.equal(
    (await call("/api/auth/reset", { password: `Bb9!${randomUUID()}` })).status,
    403,
  );
  const link = await db.auth.admin.generateLink({ type: "recovery", email });
  if (link.error) throw link.error;
  const token = link.data.properties.hashed_token;
  assert.equal(
    (await call("/api/auth/verify", { tokenHash: token, type: "recovery" }))
      .status,
    200,
  );
  const newPassword = `Bb9!${randomUUID()}`;
  assert.equal(
    (await call("/api/auth/reset", { password: newPassword })).status,
    200,
  );
  assert.equal((await call("/api/auth/reset", { password })).status, 403);
  assert.equal((await call("/api/auth/logout", {})).status, 200);
  assert.equal(
    (await call("/api/account", undefined, base, "GET")).status,
    401,
  );
  assert.equal(
    (await call("/api/auth/login", { email, password: newPassword })).status,
    200,
  );
  console.log(
    "PASS profile save, one-use recovery session, password reset, and logout through real HTTP routes",
  );
  assert.equal(
    (
      await call("/api/billing/topup", {
        pack: "small",
        requestId: randomUUID(),
      })
    ).status,
    503,
  );
  console.log(
    "PASS incomplete payment configuration blocks checkout instead of pretending to charge",
  );
} finally {
  if (id) await db.auth.admin.deleteUser(id);
  console.log("Temporary HTTP-test account cleaned up; no email sent.");
}
