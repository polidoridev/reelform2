create table public.rf_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default '', email text not null,
 stripe_customer_id text unique, stripe_subscription_id text unique,
 plan text not null default 'free' check(plan in ('free','starter','pro','studio')),
 cadence text check(cadence in ('month','year')), subscription_status text not null default 'none',
 paid_until timestamptz, cancel_at_period_end boolean not null default false,
 stripe_updated_at bigint not null default 0, billing_hold boolean not null default false,
 auto_reload_enabled boolean not null default false, auto_reload_threshold integer not null default 200 check(auto_reload_threshold between 100 and 5000),
 auto_reload_pack text not null default 'small' check(auto_reload_pack in ('small','medium','large')),
 auto_reload_cap_cents integer not null default 3000 check(auto_reload_cap_cents between 1000 and 50000),
 auto_reload_consent_at timestamptz,
 marketing_opt_in boolean not null default false, marketing_consent_at timestamptz,
 marketing_consent_source text, marketing_unsubscribed_at timestamptz, email_suppressed boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.rf_credit_grants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rf_accounts on delete cascade,
 source_id text not null unique, kind text not null check(kind in ('subscription','topup','adjustment')),
 total integer not null check(total>0), remaining integer not null check(remaining>=0 and remaining<=total),
 valid_from timestamptz not null default now(), expires_at timestamptz, created_at timestamptz not null default now()
);
create index rf_grants_user_valid on public.rf_credit_grants(user_id,valid_from,expires_at);
create table public.rf_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rf_accounts on delete cascade,
 client_id uuid not null, provider_id uuid unique, status text not null default 'reserved',
 credits integer not null check(credits>0), prompt text not null, resolution text not null,
 input jsonb not null, result_url text, error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,client_id)
);
create index rf_jobs_user_created on public.rf_jobs(user_id,created_at desc);
create table public.rf_job_allocations (job_id uuid references public.rf_jobs on delete cascade, grant_id uuid references public.rf_credit_grants on delete cascade, amount integer not null check(amount>0), primary key(job_id,grant_id));
create table public.rf_credit_ledger (
 id bigint generated always as identity primary key, user_id uuid not null references public.rf_accounts on delete cascade,
 amount integer not null, kind text not null, reference text not null unique, description text not null,
 created_at timestamptz not null default now()
);
create index rf_ledger_user_created on public.rf_credit_ledger(user_id,created_at desc);
create table public.rf_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rf_accounts on delete cascade,
 kind text not null check(kind in ('topup','auto_reload')), pack text not null,
 credits integer not null check(credits>0), amount_cents integer not null check(amount_cents>0),
 status text not null default 'pending', payment_intent_id text unique, checkout_id text unique,
 receipt_url text, error text, created_at timestamptz not null default now()
);
create index rf_orders_user_created on public.rf_orders(user_id,created_at desc);
create unique index rf_one_pending_reload on public.rf_orders(user_id) where kind='auto_reload' and status='pending';
create table public.rf_webhook_events (id text primary key, type text not null, processed_at timestamptz not null default now());
create table public.rf_email_log (id uuid primary key default gen_random_uuid(), user_id uuid references public.rf_accounts on delete cascade, kind text not null, dedupe_key text not null unique, provider_id text, status text not null default 'pending', created_at timestamptz not null default now());
create index rf_email_user on public.rf_email_log(user_id);
-- Browser clients can read their own records only. Monetary writes are service-only.
do $$ declare t text; begin
 foreach t in array array['rf_accounts','rf_credit_grants','rf_jobs','rf_credit_ledger','rf_orders','rf_email_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
 end loop;
end $$;
alter table public.rf_job_allocations enable row level security;
alter table public.rf_webhook_events enable row level security;
revoke all on public.rf_job_allocations, public.rf_webhook_events from anon, authenticated;
grant all on public.rf_job_allocations, public.rf_webhook_events to service_role;
grant usage, select on sequence public.rf_credit_ledger_id_seq to service_role;

create function public.rf_reserve_job(p_user uuid,p_client uuid,p_credits integer,p_prompt text,p_resolution text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; g public.rf_credit_grants; a public.rf_accounts; needed integer:=p_credits; taken integer; available integer; concurrency integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into j from public.rf_jobs where user_id=p_user and client_id=p_client;
 if found then return to_jsonb(j); end if;
 select * into strict a from public.rf_accounts where user_id=p_user;
 if a.billing_hold then raise exception 'BILLING_HOLD'; end if;
 if p_credits<=0 then raise exception 'INVALID_CREDITS'; end if;
 concurrency:=case a.plan when 'studio' then 3 when 'pro' then 2 else 1 end;
 if (select count(*) from public.rf_jobs where user_id=p_user and status in ('reserved','submitting','queued','in_progress','unknown'))>=concurrency then raise exception 'CONCURRENCY_LIMIT'; end if;
 select coalesce(sum(remaining),0) into available from public.rf_credit_grants where user_id=p_user and valid_from<=now() and (expires_at is null or expires_at>now());
 if available<p_credits then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.rf_jobs(user_id,client_id,credits,prompt,resolution,input) values(p_user,p_client,p_credits,p_prompt,p_resolution,p_input) returning * into j;
 for g in select * from public.rf_credit_grants where user_id=p_user and remaining>0 and valid_from<=now() and (expires_at is null or expires_at>now()) order by (kind='subscription') desc,expires_at nulls last,created_at for update loop
 taken:=least(needed,g.remaining);
 update public.rf_credit_grants set remaining=remaining-taken where id=g.id;
 insert into public.rf_job_allocations values(j.id,g.id,taken);
 needed:=needed-taken; exit when needed=0;
 end loop;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(p_user,-p_credits,'generation',j.id::text,'Video transformation');
 return to_jsonb(j);
end $$;

create function public.rf_finish_job(p_job uuid,p_status text,p_url text default null,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; x record; begin
 select * into strict j from public.rf_jobs where id=p_job;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 select * into strict j from public.rf_jobs where id=p_job for update;
 if j.status in ('completed','failed') then return; end if;
 if p_status not in ('completed','failed','queued','in_progress','unknown') then raise exception 'INVALID_STATUS'; end if;
 if p_status='failed' then
 for x in select * from public.rf_job_allocations where job_id=j.id loop
 update public.rf_credit_grants set remaining=least(total,remaining+x.amount) where id=x.grant_id;
 end loop;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(j.user_id,j.credits,'refund','refund:'||j.id,'Failed generation: credits returned') on conflict do nothing;
 end if;
 update public.rf_jobs set status=p_status,result_url=p_url,error=p_error,updated_at=now() where id=p_job;
end $$;

create function public.rf_grant_subscription(p_user uuid,p_invoice text,p_plan text,p_cadence text,p_start timestamptz,p_end timestamptz,p_credits integer)
returns void language plpgsql security invoker set search_path='' as $$
declare i integer; starts timestamptz; ends timestamptz; months integer; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_cadence not in ('month','year') or p_credits<=0 or p_end<=p_start then raise exception 'INVALID_GRANT'; end if;
 months:=case p_cadence when 'year' then 12 else 1 end;
 for i in 0..months-1 loop
 starts:=p_start+make_interval(months=>i); ends:=least(p_end,p_start+make_interval(months=>i+1));
 if starts<ends then
 insert into public.rf_credit_grants(user_id,source_id,kind,total,remaining,valid_from,expires_at) values(p_user,p_invoice||':'||i,'subscription',p_credits,p_credits,starts,ends) on conflict(source_id) do nothing;
 end if;
 end loop;
 update public.rf_accounts set paid_until=greatest(coalesce(paid_until,p_end),p_end) where user_id=p_user;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(p_user,p_credits,'subscription',p_invoice,'Monthly allowance scheduled: '||p_plan||' ('||p_cadence||' billing)') on conflict do nothing;
end $$;

create function public.rf_fulfill_topup(p_order uuid,p_payment text,p_receipt text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.rf_orders; begin
 select * into strict o from public.rf_orders where id=p_order;
 perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,0));
 select * into strict o from public.rf_orders where id=p_order for update;
 if o.status='paid' then return; end if;
 if o.status not in ('pending','requires_action') then raise exception 'ORDER_NOT_PAYABLE'; end if;
 insert into public.rf_credit_grants(user_id,source_id,kind,total,remaining) values(o.user_id,'payment:'||p_payment,'topup',o.credits,o.credits) on conflict(source_id) do nothing;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(o.user_id,o.credits,o.kind,'payment:'||p_payment,case o.kind when 'auto_reload' then 'Automatic credit reload' else 'Extra credits purchased' end) on conflict do nothing;
 update public.rf_orders set status='paid',payment_intent_id=p_payment,receipt_url=p_receipt where id=o.id;
end $$;

create function public.rf_claim_reload(p_user uuid,p_pack text,p_credits integer,p_cents integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.rf_accounts; o public.rf_orders; available integer; spent integer; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into strict a from public.rf_accounts where user_id=p_user;
 if not a.auto_reload_enabled or a.billing_hold or a.subscription_status<>'active' or a.paid_until is null or a.paid_until<=now() or a.auto_reload_pack<>p_pack then return null; end if;
 if exists(select 1 from public.rf_orders where user_id=p_user and kind='auto_reload' and status in ('pending','requires_action')) then return null; end if;
 select coalesce(sum(remaining),0) into available from public.rf_credit_grants where user_id=p_user and valid_from<=now() and (expires_at is null or expires_at>now());
 if available>=a.auto_reload_threshold then return null; end if;
 select coalesce(sum(amount_cents),0) into spent from public.rf_orders where user_id=p_user and kind='auto_reload' and status in ('paid','pending','requires_action') and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if spent+p_cents>a.auto_reload_cap_cents then return null; end if;
 insert into public.rf_orders(user_id,kind,pack,credits,amount_cents) values(p_user,'auto_reload',p_pack,p_credits,p_cents) returning * into o;
 return to_jsonb(o);
end $$;

revoke execute on function public.rf_reserve_job(uuid,uuid,integer,text,text,jsonb),public.rf_finish_job(uuid,text,text,text),public.rf_grant_subscription(uuid,text,text,text,timestamptz,timestamptz,integer),public.rf_fulfill_topup(uuid,text,text),public.rf_claim_reload(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.rf_reserve_job(uuid,uuid,integer,text,text,jsonb),public.rf_finish_job(uuid,text,text,text),public.rf_grant_subscription(uuid,text,text,text,timestamptz,timestamptz,integer),public.rf_fulfill_topup(uuid,text,text),public.rf_claim_reload(uuid,text,integer,integer) to service_role;
