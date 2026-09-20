-- Free owner testing is checked against server-managed auth metadata on every reservation.
alter table public.rf_jobs drop constraint rf_jobs_credits_check;
alter table public.rf_jobs add constraint rf_jobs_credits_check check (credits>=0);
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
 for g in select * from public.rf_credit_grants where user_id=p_user and remaining>0 and valid_from<=now() and (expires_at is null or expires_at>now()) order by (kind='subscription') desc,expires_at nulls last,created_at for update loop
 taken:=least(needed,g.remaining);
 update public.rf_credit_grants set remaining=remaining-taken where id=g.id;
 insert into public.rf_job_allocations values(j.id,g.id,taken);
 needed:=needed-taken; exit when needed=0;
 end loop;
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description) values(p_user,-p_credits,'generation',j.id::text,'Video transformation');
 return to_jsonb(j);
end $$;

create or replace function public.rf_finish_job(p_job uuid,p_status text,p_url text default null,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; x record; begin
 select * into strict j from public.rf_jobs where id=p_job;
 perform pg_advisory_xact_lock(hashtextextended(j.user_id::text,0));
 select * into strict j from public.rf_jobs where id=p_job for update;
 if j.status in ('completed','failed') then return; end if;
 if p_status not in ('completed','failed','queued','in_progress','unknown') then raise exception 'INVALID_STATUS'; end if;
 if p_status='failed' and j.credits>0 then
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


revoke execute on function public.rf_reserve_job(uuid,uuid,integer,text,text,jsonb),public.rf_finish_job(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.rf_reserve_job(uuid,uuid,integer,text,text,jsonb),public.rf_finish_job(uuid,text,text,text) to service_role;
