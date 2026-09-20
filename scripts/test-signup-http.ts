import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const base = process.env.TEST_APP_URL || "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const settings = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
}).then(r => r.json()) as { mailer_autoconfirm: boolean };
assert.equal(settings.mailer_autoconfirm, true, "This no-email regression check requires auto-confirm to already be enabled; it never changes auth settings.");
const email = `qa-signup-${randomUUID()}@example.invalid`;
let cookie = "";
try {
  const signup = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `Aa9!${randomUUID()}`, name: "Signup QA", marketing: false }),
  });
  cookie = signup.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
  const result = await signup.json() as { redirect?: string; message?: string };
  assert.equal(signup.status, 200);
  assert.equal(result.redirect, "/account");
  assert.equal(result.message, undefined, "An active session must not show a confirmation-email message.");
  const account = await fetch(`${base}/api/account`, { headers: { Cookie: cookie } });
  assert.equal(account.status, 200);
  const data = await account.json() as { account: { email: string; full_name: string } };
  assert.equal(data.account.email, email);
  assert.equal(data.account.full_name, "Signup QA");
  console.log("PASS signup returns an account redirect and working session, without claiming an email was sent.");
} finally {
  if (cookie) await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const user = data.users.find(u => u.email === email);
  if (user) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;
  }
  console.log("Temporary signup account cleaned up; no email sent.");
}
