alter table public.rf_accounts add column maintenance_at timestamptz, add column marketing_checked_at timestamptz;
create index rf_allocations_grant on public.rf_job_allocations(grant_id);
create index rf_accounts_maintenance on public.rf_accounts(maintenance_at) where stripe_subscription_id is not null;
