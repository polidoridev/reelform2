create function public.rf_balances(p_user uuid) returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'total',coalesce(sum(remaining) filter(where valid_from<=now() and (expires_at is null or expires_at>now())),0),
 'subscription',coalesce(sum(remaining) filter(where kind='subscription' and valid_from<=now() and expires_at>now()),0),
 'purchased',coalesce(sum(remaining) filter(where kind<>'subscription' and valid_from<=now() and (expires_at is null or expires_at>now())),0),
 'nextReset',min(expires_at) filter(where kind='subscription' and valid_from<=now() and expires_at>now()),
 'nextGrant',min(valid_from) filter(where valid_from>now())
) from public.rf_credit_grants where user_id=p_user;
$$;
revoke execute on function public.rf_balances(uuid) from public,anon,authenticated;
grant execute on function public.rf_balances(uuid) to service_role;
