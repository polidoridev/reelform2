create table public.rf_checkout_sessions (
 user_id uuid primary key references public.rf_accounts on delete cascade,
 id uuid not null default gen_random_uuid(), plan text not null, cadence text not null,
 expires_at timestamptz not null default now()+interval '1 hour', stripe_session_id text
);
alter table public.rf_checkout_sessions enable row level security;
revoke all on public.rf_checkout_sessions from anon,authenticated;
grant all on public.rf_checkout_sessions to service_role;
create function public.rf_claim_checkout(p_user uuid,p_plan text,p_cadence text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.rf_checkout_sessions;begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into c from public.rf_checkout_sessions where user_id=p_user;
 if found and c.expires_at>now() then return to_jsonb(c);end if;
 insert into public.rf_checkout_sessions(user_id,plan,cadence) values(p_user,p_plan,p_cadence)
 on conflict(user_id) do update set id=gen_random_uuid(),plan=p_plan,cadence=p_cadence,expires_at=now()+interval '1 hour',stripe_session_id=null returning * into c;
 return to_jsonb(c);end $$;
revoke execute on function public.rf_claim_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.rf_claim_checkout(uuid,text,text) to service_role;

create or replace function public.rf_finish_job(p_job uuid,p_status text,p_url text default null,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; x record; begin
 select * into strict j from public.rf_jobs where id=p_job;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 select * into strict j from public.rf_jobs where id=p_job for update;
 if j.status in ('completed','failed') then return; end if;
 if p_status not in ('completed','failed','queued','in_progress','unknown') then raise exception 'INVALID_STATUS'; end if;
 if p_status='failed' then
 for x in select * from public.rf_job_allocations where job_id=j.id loop
 if exists(select 1 from public.rf_credit_grants where id=x.grant_id and expires_at<=now()) then
 insert into public.rf_credit_grants(user_id,source_id,kind,total,remaining)
 values(j.user_id,'expired-refund:'||j.id||':'||x.grant_id,'adjustment',x.amount,x.amount) on conflict do nothing;
 else
 update public.rf_credit_grants set remaining=least(total,remaining+x.amount) where id=x.grant_id;
 end if;
 end loop;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(j.user_id,j.credits,'refund','refund:'||j.id,'Failed generation: credits returned') on conflict do nothing;
 end if;
 update public.rf_jobs set status=p_status,result_url=p_url,error=p_error,updated_at=now() where id=p_job;
end $$;

