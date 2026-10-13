-- Extend the existing server-only identity lookup with only trial eligibility fields.
-- Do not grant table-wide auth access or expose identity records to browsers.
grant select (email,email_confirmed_at,created_at) on auth.users to service_role;

create or replace function public.rf_trial_status(p_user uuid,p_device text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare c public.rf_trial_campaign; claim public.rf_trial_claims; u record; a public.rf_accounts; h text;
begin
 select * into c from public.rf_trial_campaign where id;
 select id,email,email_confirmed_at,created_at,raw_app_meta_data into u from auth.users where id=p_user;
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
