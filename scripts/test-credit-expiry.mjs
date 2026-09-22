// Isolated PostgreSQL checks; no connection to production or payment services.
// PGLITE_MODULE points to an installed @electric-sql/pglite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const user = '00000000-0000-0000-0000-000000000001';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
  await migration('20260920172227_reelform_accounts_billing.sql');
  await migration('20260920180103_reelform_balance_clock.sql');
  await migration('20260920201916_reelform_admin_testing.sql');
  await db.query(`insert into auth.users(id) values($1);`, [user]);
  await db.query(`insert into rf_accounts(user_id,email,plan) values($1,'test@example.invalid','studio')`, [user]);
  await db.query(`insert into rf_credit_grants(user_id,source_id,kind,total,remaining,valid_from,expires_at) values
    ($1,'legacy','topup',100,100,now()-interval '200 days',null),
    ($1,'expired','subscription',100,100,now()-interval '60 days',now()-interval '30 days'),
    ($1,'active','subscription',100,100,now()-interval '20 days',now()+interval '10 days')`, [user]);
  await migration('20260922152536_credit_expiry_90_days.sql');
  const legacy = await one(`select extract(epoch from expires_at-now())/86400 as days from rf_credit_grants where source_id='legacy'`);
  assert.ok(Number(legacy.days) > 89.99 && Number(legacy.days) <= 90);
  assert.equal((await one(`select expires_at<now() as expired from rf_credit_grants where source_id='expired'`)).expired, true);
  assert.equal(Number((await one(`select extract(epoch from expires_at-valid_from)/86400 as days from rf_credit_grants where source_id='active'`)).days), 90);
  console.log('PASS legacy transition grants 90 days without reviving expired credits');
  await db.exec('update rf_credit_grants set remaining=0');
  for (const kind of ['topup','auto_reload']) {
    const order = await one(`insert into rf_orders(user_id,kind,pack,credits,amount_cents) values($1,$2,'small',900,1000) returning id`, [user,kind]);
    await db.query(`select rf_fulfill_topup($1,$2)`, [order.id,`payment-${kind}`]);
    await db.query(`select rf_fulfill_topup($1,$2)`, [order.id,`payment-${kind}`]);
    const grant = await one(`select count(*)::int as count,min(extract(epoch from expires_at-valid_from)/86400) as days from rf_credit_grants where source_id=$1`, [`payment:payment-${kind}`]);
    assert.equal(grant.count,1); assert.equal(Number(grant.days),90);
  }
  console.log('PASS purchases and auto-reloads expire in 90 days; repeated fulfillment does not duplicate grants');
  await db.exec('update rf_credit_grants set remaining=0');
  await db.query(`select rf_grant_subscription($1,'annual','studio','year',now(),now()+interval '1 year',1000)`, [user]);
  const annual = await one(`select count(*)::int as count,count(*) filter(where valid_from>now())::int as future,bool_and(expires_at=valid_from+interval '2160 hours') as valid from rf_credit_grants where source_id like 'annual:%'`);
  assert.deepEqual(annual,{count:12,future:11,valid:true});
  const balance = await one('select rf_balances($1) as b',[user]);
  assert.equal(balance.b.total,1000);
  console.log('PASS annual plan releases monthly with independent 90-day expiry dates');
  await db.query(`select rf_grant_subscription($1,'last-month','starter','month',now()-interval '40 days',now()-interval '10 days',200)`,[user]);
  await db.query(`select rf_grant_subscription($1,'last-month','starter','month',now()-interval '40 days',now()-interval '10 days',200)`,[user]);
  assert.equal((await one('select rf_balances($1) as b',[user])).b.total,1200);
  console.log('PASS subscription credits carry over past a billing month without duplicating invoice grants');
  // Earlier-expiring purchased credits must be spent before subscription credits.
  await db.query(`insert into rf_credit_grants(user_id,source_id,kind,total,remaining,expires_at) values($1,'soon','topup',200,200,now()+interval '1 day')`,[user]);
  const next = (await one('select rf_balances($1) as b',[user])).b;
  assert.equal(next.nextExpiryCredits,200); assert.ok(next.nextExpiry);
  const job = (await one(`select rf_reserve_job($1,gen_random_uuid(),100,'Test','720p','{}') as j`,[user])).j;
  assert.equal((await one(`select remaining from rf_credit_grants where source_id='soon'`)).remaining,100);
  const expiry = (await one(`select expires_at from rf_credit_grants where source_id='soon'`)).expires_at;
  await db.query(`select rf_finish_job($1,'failed')`,[job.id]);
  assert.equal((await one(`select remaining from rf_credit_grants where source_id='soon'`)).remaining,200);
  assert.deepEqual((await one(`select expires_at from rf_credit_grants where source_id='soon'`)).expires_at,expiry);
  const late = (await one(`select rf_reserve_job($1,gen_random_uuid(),100,'Test','720p','{}') as j`,[user])).j;
  await db.exec(`update rf_credit_grants set expires_at=now()-interval '1 second' where source_id='soon'`);
  await db.query(`select rf_finish_job($1,'failed')`,[late.id]);
  await db.query(`select rf_finish_job($1,'failed')`,[late.id]);
  const refund = await one(`select count(*)::int as count,min(extract(epoch from expires_at-valid_from)/86400) as days from rf_credit_grants where source_id like 'expired-refund:%'`);
  assert.equal(refund.count,1); assert.equal(Number(refund.days),90);
  console.log('PASS earliest-expiry spending and idempotent refunds preserve valid expiry or issue a new 90-day grant');
  await db.exec('begin; update rf_credit_grants set expires_at=now()');
  assert.equal((await one('select rf_balances($1) as b',[user])).b.total,0);
  assert.equal((await one('select rf_balances($1) as b',[user])).b.nextExpiry,null);
  await assert.rejects(db.query(`select rf_reserve_job($1,gen_random_uuid(),1,'Test','720p','{}')`,[user]),/INSUFFICIENT_CREDITS/);
  await db.exec('rollback');
  console.log('PASS credits are excluded and unspendable at the exact expiry boundary');
} finally { await db.close(); }
