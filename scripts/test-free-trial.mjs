// Isolated Postgres checks. No production writes or provider submissions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url),'utf8'));
const device = n => String(n).padStart(64,'0');
async function user(email, confirmed=true, old=false) {
 const id=randomUUID();
 await db.query(`insert into auth.users(id,email,email_confirmed_at,created_at) values($1,$2,case when $3 then now() end,now()+case when $4 then interval '-1 day' else interval '1 second' end)`,[id,email,confirmed,old]);
 await db.query(`insert into rf_accounts(user_id,email) values($1,$2)`,[id,email]); return id;
}
const status = async (id,d) => (await one('select rf_trial_status($1,$2) as s',[id,device(d)])).s;
const base = {model:'seedance-2.5-edit',videoUrl:'https://example.invalid/source.mp4',imageUrls:[],generateAudio:false,media:{duration:5},estimatedProviderUsd:1.25};
async function reserve(id,d,client=randomUUID(),input=base,resolution='480p') {
 return (await one('select rf_reserve_trial_job($1,$2,$3,$4,$5,$6) as j',[id,client,'Make the light golden.',resolution,JSON.stringify(input),device(d)])).j;
}
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
 for (const file of ['20260920172227_reelform_accounts_billing.sql','20260920180103_reelform_balance_clock.sql','20260920201916_reelform_admin_testing.sql','20260920202219_reelform_admin_role_lookup.sql','20260922152536_credit_expiry_90_days.sql','20261001130123_free_generation_trial.sql','20261001130321_trial_identity_columns.sql']) await migration(file);
 await db.exec('grant usage on schema auth to service_role');
 const id=await user('new@example.invalid');
 await db.exec('set role service_role');
 assert.equal((await status(id,1)).state,'available');
 await db.exec('reset role');
 console.log('PASS actual server role can read only the required auth identity columns');
 assert.equal((await status(id,1)).state,'available');
 for (const [email,verified,old] of [['unverified@example.invalid',false,false],['old@example.invalid',true,true]]) {
   const u=await user(email,verified,old); assert.equal((await status(u,2)).state,'ineligible'); await assert.rejects(reserve(u,2),/TRIAL_UNAVAILABLE/);
 }
 for (const input of [{...base,model:'genjutsu-object'},{...base,generateAudio:true},{...base,media:{duration:6}},{...base,imageUrls:['one','two']},{...base,estimatedProviderUsd:2},{...base,videoUrl:null}]) await assert.rejects(reserve(id,1,randomUUID(),input),/INVALID_TRIAL_SETTINGS/);
 await assert.rejects(reserve(id,1,randomUUID(),base,'720p'),/INVALID_TRIAL_SETTINGS/);
 assert.equal((await one('select reserved_cents from rf_trial_campaign')).reserved_cents,0);
 console.log('PASS verified new accounts only; settings enforced before reserving budget');
 await db.exec('set role service_role');
 const client=randomUUID(), job=await reserve(id,1,client);
 await db.exec('reset role');
 assert.equal(job.credits,0); assert.equal(job.input.trial,true);
 assert.equal((await reserve(id,1,client)).id,job.id);
 assert.equal((await one('select reserved_cents from rf_trial_campaign')).reserved_cents,130);
 assert.equal((await status(id,1)).state,'active');
 await assert.rejects(reserve(id,1),/TRIAL_UNAVAILABLE:active/);
 await db.query(`select rf_finish_job($1,'unknown')`,[job.id]);
 await assert.rejects(reserve(id,1),/TRIAL_UNAVAILABLE:active/);
 console.log('PASS idempotency, concurrent second requests, and uncertain provider outcomes');
 await db.query(`select rf_finish_job($1,'failed')`,[job.id]);
 assert.deepEqual(await status(id,1),{state:'available',attemptsRemaining:2});
 assert.equal((await one('select rf_balances($1) as b',[id])).b.total,0);
 const second=await reserve(id,1); await db.query(`select rf_finish_job($1,'failed')`,[second.id]);
 const third=await reserve(id,1); await db.query(`select rf_finish_job($1,'failed')`,[third.id]);
 assert.equal((await status(id,1)).state,'exhausted');
 await assert.rejects(reserve(id,1),/TRIAL_UNAVAILABLE:exhausted/);
 assert.equal((await one('select reserved_cents from rf_trial_campaign')).reserved_cents,390);
 console.log('PASS failed retries stop after three attempts; no credits minted; budget never refunded');
 const success=await user('one.name+trial@gmail.com'); const good=await reserve(success,3);
 await db.query(`select rf_finish_job($1,'completed','https://example.invalid/result.mp4')`,[good.id]);
 assert.equal((await status(success,3)).state,'completed');
 assert.equal((await reserve(success,3,good.client_id)).id,good.id);
 await db.query('delete from auth.users where id=$1',[success]);
 const duplicate=await user('onename@gmail.com'); assert.equal((await status(duplicate,4)).state,'ineligible');
 const sameDevice=await user('different@example.invalid'); assert.equal((await status(sameDevice,3)).state,'ineligible');
 console.log('PASS completed trials consumed; normalized email and device checks survive account deletion');
 const paid=await user('paid@example.invalid');
 await db.query(`insert into rf_credit_grants(user_id,source_id,kind,total,remaining) values($1,'paid','topup',100,100)`,[paid]);
 assert.equal((await status(paid,5)).state,'ineligible');
 const paidJob=(await one(`select rf_reserve_job($1,$2,50,'Paid video','720p','{}') as j`,[paid,randomUUID()])).j;
 assert.equal(paidJob.credits,50); await db.query(`select rf_finish_job($1,'failed')`,[paidJob.id]);
 assert.equal((await one('select rf_balances($1) as b',[paid])).b.total,100);
 await assert.rejects(db.query(`select rf_reserve_job($1,$2,0,'Forged free','480p','{}')`,[paid,randomUUID()]),/INVALID_CREDITS/);
 console.log('PASS paid credit spending/refunds preserved; ordinary zero-credit reservation rejected');
 const limited=await user('limit@example.invalid');
 await db.exec('update rf_trial_campaign set max_users=2');
 assert.equal((await status(limited,6)).state,'paused');
 await db.exec('update rf_trial_campaign set max_users=100,budget_cents=reserved_cents+129');
 await assert.rejects(reserve(limited,6),/TRIAL_UNAVAILABLE:paused/);
 await db.exec('update rf_trial_campaign set budget_cents=reserved_cents+130');
 await reserve(limited,6);
 assert.equal((await one('select reserved_cents=budget_cents as capped from rf_trial_campaign')).capped,true);
 const another=await user('another@example.invalid'); await assert.rejects(reserve(another,7),/TRIAL_UNAVAILABLE:paused/);
 await db.exec('update rf_trial_campaign set budget_cents=15000,enabled=false');
 await assert.rejects(reserve(another,7),/TRIAL_UNAVAILABLE:paused/);
 console.log('PASS participant cap, exact budget boundary, and kill switch');
 for(const role of ['anon','authenticated']) {
   assert.equal((await one(`select has_function_privilege($1,'public.rf_reserve_trial_job(uuid,uuid,text,text,jsonb,text)','execute') as allowed`,[role])).allowed,false);
   assert.equal((await one(`select has_table_privilege($1,'public.rf_trial_campaign','update') as allowed`,[role])).allowed,false);
 }
 console.log('PASS browser roles cannot grant trials, change budget, or invoke reservation RPC');
} finally {await db.close();}
