alter table public.rf_instagram_posts add column scheduled_at timestamptz;
alter table public.rf_instagram_posts drop constraint rf_instagram_posts_status_check;
alter table public.rf_instagram_posts add constraint rf_instagram_posts_status_check
  check (status in ('queued','creating','processing','publishing','published','failed','unknown','cancelled'));
drop index public.rf_instagram_posts_pending;
create index rf_instagram_posts_pending on public.rf_instagram_posts(updated_at, scheduled_at)
  where status not in ('published','failed','cancelled');

-- Cache one generated caption per video; an atomic claim bounds repeated provider calls.
create table public.rf_instagram_captions (
  job_id uuid primary key references public.rf_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text check (char_length(caption) <= 2200),
  requested_at timestamptz not null default now()
);
create index rf_instagram_captions_user on public.rf_instagram_captions(user_id);
alter table public.rf_instagram_captions enable row level security;
revoke all on public.rf_instagram_captions from public, anon, authenticated;
grant all on public.rf_instagram_captions to service_role;
