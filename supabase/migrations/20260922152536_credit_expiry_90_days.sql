-- Every newly issued credit grant lasts exactly 90 days from availability.
-- Existing perpetual credits receive a full transition window from deployment.
-- Do not revive already-expired grants or alter historical ledger entries.
update public.rf_credit_grants
set expires_at=greatest(now(),valid_from)+interval '2160 hours'
where expires_at is null;
update public.rf_credit_grants
set expires_at=valid_from+interval '2160 hours'
where kind='subscription' and expires_at>now();

create function public.rf_default_credit_expiry()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.expires_at is null then
   new.expires_at:=new.valid_from+interval '2160 hours';
 end if;
 return new;
end $$;
revoke execute on function public.rf_default_credit_expiry() from public,anon,authenticated;
grant execute on function public.rf_default_credit_expiry() to service_role;
create trigger rf_credit_expiry before insert on public.rf_credit_grants
for each row execute function public.rf_default_credit_expiry();
alter table public.rf_credit_grants alter column expires_at set not null;

-- Covers purchases, automatic reloads, and replacement grants for late refunds.
-- Refunds to unexpired grants retain their original expiry date.
create or replace function public.rf_grant_subscription(p_user uuid,p_invoice text,p_plan text,p_cadence text,p_start timestamptz,p_end timestamptz,p_credits integer)
returns void language plpgsql security invoker set search_path='' as $$
declare i integer; starts timestamptz; ends timestamptz; months integer; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_cadence not in ('month','year') or p_credits<=0 or p_end<=p_start then raise exception 'INVALID_GRANT'; end if;
 months:=case p_cadence when 'year' then 12 else 1 end;
 for i in 0..months-1 loop
 starts:=p_start+make_interval(months=>i); ends:=least(p_end,p_start+make_interval(months=>i+1));
 if starts<ends then
 insert into public.rf_credit_grants(user_id,source_id,kind,total,remaining,valid_from,expires_at) values(p_user,p_invoice||':'||i,'subscription',p_credits,p_credits,starts,starts+interval '2160 hours') on conflict(source_id) do nothing;
 end if;
 end loop;
 update public.rf_accounts set paid_until=greatest(coalesce(paid_until,p_end),p_end) where user_id=p_user;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(p_user,p_credits,'subscription',p_invoice,'Monthly allowance scheduled: '||p_plan||' ('||p_cadence||' billing)') on conflict do nothing;
end $$;


create or replace function public.rf_reserve_job(p_user uuid,p_client uuid,p_credits integer,p_prompt text,p_resolution text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; g public.rf_credit_grants; a public.rf_accounts; needed integer:=p_credits; taken integer; available integer; concurrency integer; owner_testing boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into j from public.rf_jobs where user_id=p_user and client_id=p_client;
 if found then return to_jsonb(j); end if;
 select * into strict a from public.rf_accounts where user_id=p_user;
 if a.billing_hold then raise exception 'BILLING_HOLD'; end if;
 select coalesce(raw_app_meta_data->'reelform_admin' = 'true'::jsonb,false) into owner_testing from auth.users where id=p_user;
 if p_credits is null or p_credits<0 or (p_credits=0 and not owner_testing) then raise exception 'INVALID_CREDITS'; end if;
 concurrency:=case when owner_testing then 3 when a.plan='studio' then 3 when a.plan='pro' then 2 else 1 end;

 if (select count(*) from public.rf_jobs where user_id=p_user and status in ('reserved','submitting','queued','in_progress','unknown'))>=concurrency then raise exception 'CONCURRENCY_LIMIT'; end if;
 if owner_testing then
 insert into public.rf_jobs(user_id,client_id,credits,prompt,resolution,input)
 values(p_user,p_client,0,p_prompt,p_resolution,p_input) returning * into j;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description)
 values(p_user,0,'admin_generation',j.id::text,'Admin test: no Reelform credit charge');
 return to_jsonb(j);
 end if;
 select coalesce(sum(remaining),0) into available from public.rf_credit_grants where user_id=p_user and valid_from<=now() and (expires_at is null or expires_at>now());
 if available<p_credits then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into public.rf_jobs(user_id,client_id,credits,prompt,resolution,input) values(p_user,p_client,p_credits,p_prompt,p_resolution,p_input) returning * into j;
 for g in select * from public.rf_credit_grants where user_id=p_user and remaining>0 and valid_from<=now() and (expires_at is null or expires_at>now()) order by expires_at,created_at,id for update loop
 taken:=least(needed,g.remaining);
 update public.rf_credit_grants set remaining=remaining-taken where id=g.id;
 insert into public.rf_job_allocations values(j.id,g.id,taken);
 needed:=needed-taken; exit when needed=0;
 end loop;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(p_user,-p_credits,'generation',j.id::text,'Video transformation');
 return to_jsonb(j);
end $$;


create or replace function public.rf_balances(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
with available as (
 select * from public.rf_credit_grants where user_id=p_user
), upcoming_expiry as (
 select min(expires_at) as at from available where remaining>0 and valid_from<=now() and expires_at>now()
)
select jsonb_build_object(
 'total',coalesce(sum(remaining) filter(where valid_from<=now() and (expires_at is null or expires_at>now())),0),
 'subscription',coalesce(sum(remaining) filter(where kind='subscription' and valid_from<=now() and expires_at>now()),0),
 'purchased',coalesce(sum(remaining) filter(where kind<>'subscription' and valid_from<=now() and (expires_at is null or expires_at>now())),0),
 'nextReset',min(expires_at) filter(where kind='subscription' and remaining>0 and valid_from<=now() and expires_at>now()),
 'nextGrant',min(valid_from) filter(where valid_from>now()),
 'nextExpiry',(select at from upcoming_expiry),
 'nextExpiryCredits',coalesce(sum(remaining) filter(where remaining>0 and valid_from<=now() and expires_at=(select at from upcoming_expiry)),0)
) from available;
$$;
revoke execute on function public.rf_balances(uuid) from public,anon,authenticated;
grant execute on function public.rf_balances(uuid) to service_role;
