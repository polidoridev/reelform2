-- One successful transformation for new verified users. Separate from paid credits.
create table public.rf_trial_campaign (
 id boolean primary key default true check(id), enabled boolean not null default true,
 starts_at timestamptz not null default now(), max_users integer not null default 100 check(max_users>0),
 budget_cents integer not null default 15000 check(budget_cents>=0),
 reserved_cents integer not null default 0 check(reserved_cents>=0)
);
insert into public.rf_trial_campaign(id) values(true);
-- Retain pseudonymous claims across account deletion to prevent repeated signup trials.
create table public.rf_trial_claims (
 email_hash text primary key, user_id uuid not null unique, device_hash text not null unique,
 attempts integer not null default 0, created_at timestamptz not null default now()
);
create table public.rf_trial_attempts (
 job_id uuid primary key, user_id uuid not null, status text not null default 'reserved',
 reserved_cents integer not null default 130, created_at timestamptz not null default now()
);
create index rf_trial_attempts_user on public.rf_trial_attempts(user_id);
do $$ declare t text; begin
 foreach t in array array['rf_trial_campaign','rf_trial_claims','rf_trial_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.rf_trial_email_hash(p_email text) returns text
language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(
 case when split_part(lower(trim(p_email)),'@',2) in ('gmail.com','googlemail.com')
 then replace(split_part(split_part(lower(trim(p_email)),'@',1),'+',1),'.','')||'@gmail.com'
 else lower(trim(p_email)) end,'UTF8')),'hex');
$$;

create function public.rf_trial_status(p_user uuid,p_device text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.rf_trial_campaign; claim public.rf_trial_claims; u auth.users; a public.rf_accounts; h text;
begin
 select * into c from public.rf_trial_campaign where id;
 select * into u from auth.users where id=p_user;
 select * into a from public.rf_accounts where user_id=p_user;
 h:=public.rf_trial_email_hash(u.email);
 select * into claim from public.rf_trial_claims where user_id=p_user;
 if exists(select 1 from public.rf_trial_attempts where user_id=p_user and status='completed') then
 return jsonb_build_object('state','completed','attemptsRemaining',0); end if;
 if exists(select 1 from public.rf_trial_attempts where user_id=p_user and status not in ('failed','completed')) then
 return jsonb_build_object('state','active','attemptsRemaining',0); end if;
 if claim.attempts>=3 then return jsonb_build_object('state','exhausted','attemptsRemaining',0); end if;
 if u.id is null or u.email_confirmed_at is null or u.email is null or u.created_at<c.starts_at
 or a.user_id is null or a.billing_hold or a.plan<>'free' or a.paid_until is not null
 or coalesce(u.raw_app_meta_data->'reelform_admin'='true'::jsonb,false)
 or exists(select 1 from public.rf_credit_grants where user_id=p_user)
 or exists(select 1 from public.rf_jobs where user_id=p_user and credits>0)
 or exists(select 1 from public.rf_trial_claims where (email_hash=h or device_hash=p_device) and user_id<>p_user)
 then return jsonb_build_object('state','ineligible','attemptsRemaining',0); end if;
 if c.id is null or not c.enabled or c.reserved_cents+130>c.budget_cents
 or (claim.user_id is null and (select count(*) from public.rf_trial_claims)>=c.max_users)
 then return jsonb_build_object('state','paused','attemptsRemaining',0); end if;
 return jsonb_build_object('state','available','attemptsRemaining',3-coalesce(claim.attempts,0));
end $$;

create function public.rf_reserve_trial_job(p_user uuid,p_client uuid,p_prompt text,p_resolution text,p_input jsonb,p_device text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.rf_jobs; state jsonb; h text;
begin
 -- Same per-user lock as paid reservations, followed by a global campaign lock.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into j from public.rf_jobs where user_id=p_user and client_id=p_client;
 if found then return to_jsonb(j); end if;
 perform 1 from public.rf_trial_campaign where id for update;
 state:=public.rf_trial_status(p_user,p_device);
 if state->>'state'<>'available' then raise exception 'TRIAL_UNAVAILABLE:%',state->>'state'; end if;
 if p_device is null or length(p_device)<>64 or p_resolution is distinct from '480p'
 or p_input->>'model' is distinct from 'seedance-2.5-edit'
 or coalesce(p_input->>'videoUrl','')='' or p_input->>'generateAudio' is distinct from 'false'
 or jsonb_typeof(p_input->'imageUrls') is distinct from 'array'
 or jsonb_array_length(p_input->'imageUrls')>1
 or coalesce((p_input->'media'->>'duration')::numeric,0) not between 4 and 5
 or coalesce((p_input->>'estimatedProviderUsd')::numeric,0) not between 0.01 and 1.30
 then raise exception 'INVALID_TRIAL_SETTINGS'; end if;
 if exists(select 1 from public.rf_jobs where user_id=p_user and status in ('reserved','submitting','queued','in_progress','unknown')) then raise exception 'CONCURRENCY_LIMIT'; end if;
 select public.rf_trial_email_hash(email) into h from auth.users where id=p_user;
 insert into public.rf_trial_claims(email_hash,user_id,device_hash,attempts) values(h,p_user,p_device,1)
 on conflict(user_id) do update set attempts=public.rf_trial_claims.attempts+1;
 -- Never release the cost reservation: failed/unknown jobs may still be billed.
 update public.rf_trial_campaign set reserved_cents=reserved_cents+130 where id;
 insert into public.rf_jobs(user_id,client_id,credits,prompt,resolution,input)
 values(p_user,p_client,0,p_prompt,p_resolution,p_input||'{"trial":true}'::jsonb) returning * into j;
 insert into public.rf_trial_attempts(job_id,user_id) values(j.id,p_user);
 insert into public.rf_credit_ledger(user_id,amount,kind,reference,description)
 values(p_user,0,'trial_generation',j.id::text,'Free transformation');
 return to_jsonb(j);
end $$;

create function public.rf_sync_trial_job() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.rf_trial_attempts set status=new.status where job_id=new.id;
 return new;
end $$;
create trigger rf_sync_trial_job after update of status on public.rf_jobs
for each row when (old.status is distinct from new.status) execute function public.rf_sync_trial_job();

revoke execute on function public.rf_trial_email_hash(text),public.rf_trial_status(uuid,text),public.rf_reserve_trial_job(uuid,uuid,text,text,jsonb,text),public.rf_sync_trial_job() from public,anon,authenticated;
grant execute on function public.rf_trial_email_hash(text),public.rf_trial_status(uuid,text),public.rf_reserve_trial_job(uuid,uuid,text,text,jsonb,text),public.rf_sync_trial_job() to service_role;
