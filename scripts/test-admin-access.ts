import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const base = process.env.TEST_APP_URL || "http://localhost:3000";
const ids: string[] = [];
const jobs: string[] = [];
let cookie = "";
async function reserve(user: string, credits: number, client = randomUUID()) {
  return db.rpc("rf_reserve_job", { p_user: user, p_client: client, p_credits: credits, p_prompt: "Admin access regression test", p_resolution: "720p", p_input: {} });
}
try {
  for (const owner of [true, false]) {
    const email = `qa-role-${randomUUID()}@example.invalid`, password = `Aa9!${randomUUID()}`;
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true,
      app_metadata: owner ? { reelform_admin: true } : {},
      user_metadata: { reelform_admin: true, role: "admin" },
    });
    if (created.error) throw created.error;
    const id = created.data.user.id; ids.push(id);
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({email,password}) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const response = await fetch(`${base}/api/account`, { headers: {Cookie: cookie} });
    const account = await response.json() as { isAdmin: boolean };
    assert.equal(account.isAdmin, owner, "User-editable metadata must not grant access");
    if (owner) {
      const client = randomUUID();
      const first = await reserve(id, 0, client); if(first.error) throw first.error;
      assert.equal(first.data.credits, 0); jobs.push(first.data.id);
      const again = await reserve(id, 0, client); assert.equal(again.data.id, first.data.id);
      for (let i=0;i<2;i++) { const r=await reserve(id,1000); if(r.error)throw r.error; assert.equal(r.data.credits,0); jobs.push(r.data.id); }
      const fourth = await reserve(id, 0); assert.match(fourth.error!.message,/CONCURRENCY_LIMIT/);
      for (const job of jobs) { const r=await db.rpc("rf_finish_job",{p_job:job,p_status:"failed"});if(r.error)throw r.error; }
      const ledger=await db.from("rf_credit_ledger").select("amount,kind").eq("user_id",id);if(ledger.error)throw ledger.error;
      assert.equal(ledger.data.length,3);assert.ok(ledger.data.every(x=>x.amount===0 && x.kind==='admin_generation'));
      const topup=await fetch(`${base}/api/billing/topup`,{method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/json"},body:JSON.stringify({pack:"small"})});assert.equal(topup.status,409);
      const revoked=await db.auth.admin.updateUserById(id,{app_metadata:{reelform_admin:false}});if(revoked.error)throw revoked.error;
      assert.match((await reserve(id,0)).error!.message,/INVALID_CREDITS/);
      const after=await fetch(`${base}/api/account`,{headers:{Cookie:cookie}}).then(r=>r.json()) as {isAdmin:boolean};assert.equal(after.isAdmin,false,"Revocation must take effect with the existing cookie");
    } else {
      assert.match((await reserve(id,0)).error!.message,/INVALID_CREDITS/);
      assert.match((await reserve(id,1000)).error!.message,/INSUFFICIENT_CREDITS/);
      const publicClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      await publicClient.auth.signInWithPassword({email,password});
      const r=await publicClient.rpc("rf_reserve_job",{p_user:id,p_client:randomUUID(),p_credits:0,p_prompt:"Cannot bypass",p_resolution:"720p",p_input:{}});assert.ok(r.error);
      await publicClient.auth.signOut();
    }
    await fetch(`${base}/api/auth/logout`,{method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/json"},body:"{}"});cookie="";
  }
  console.log("PASS admin free reservations, idempotency, 3-job limit, zero-credit refunds, purchase protection, immediate revocation, and forged role rejection.");
} finally {
  if(cookie)await fetch(`${base}/api/auth/logout`,{method:"POST",headers:{Origin:base,Cookie:cookie,"Content-Type":"application/json"},body:"{}"});
  for(const id of ids){const r=await db.auth.admin.deleteUser(id);if(r.error)throw r.error;}
  console.log("Temporary role-test accounts cleaned up. No provider requests or payments made.");
}
