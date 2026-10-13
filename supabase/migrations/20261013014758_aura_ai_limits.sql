-- Service-only, atomic rate limits shared by all serverless instances.
create table public.rf_aura_ai_limits (
  scope text not null,
  bucket timestamptz not null,
  requests integer not null default 0 check (requests >= 0),
  primary key (scope, bucket)
);
alter table public.rf_aura_ai_limits enable row level security;
revoke all on public.rf_aura_ai_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rf_aura_ai_limits to service_role;

create function public.rf_reserve_aura_ai(p_user uuid, p_daily_limit integer, p_global_limit integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_minute timestamptz := date_trunc('minute', now());
  v_user text := 'user:' || p_user::text;
begin
  if p_user is null or p_daily_limit not between 1 and 10000 or p_global_limit not between 1 and 10000 then
    raise exception 'Invalid AI request limits';
  end if;
  -- Serialize reservation only; the provider call runs outside this transaction.
  perform pg_advisory_xact_lock(714256913);
  delete from public.rf_aura_ai_limits where bucket < v_day - interval '2 days';
  if coalesce((select requests from public.rf_aura_ai_limits where scope = 'global' and bucket = v_day), 0) >= p_global_limit
    or coalesce((select requests from public.rf_aura_ai_limits where scope = v_user and bucket = v_day), 0) >= p_daily_limit
    or coalesce((select requests from public.rf_aura_ai_limits where scope = v_user || ':minute' and bucket = v_minute), 0) >= 2 then
    return false;
  end if;
  insert into public.rf_aura_ai_limits(scope, bucket, requests) values
    ('global', v_day, 1), (v_user, v_day, 1), (v_user || ':minute', v_minute, 1)
  on conflict(scope, bucket) do update set requests = public.rf_aura_ai_limits.requests + 1;
  return true;
end;
$$;
revoke all on function public.rf_reserve_aura_ai(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.rf_reserve_aura_ai(uuid, integer, integer) to service_role;
