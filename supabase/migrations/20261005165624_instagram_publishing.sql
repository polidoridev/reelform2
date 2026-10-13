-- Service-only: Instagram credentials and publishing operations never reach the Data API client.
create table public.rf_instagram_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instagram_user_id text not null unique,
  app_scoped_id text not null,
  username text not null,
  token_ciphertext text not null,
  expires_at timestamptz not null,
  refreshed_at timestamptz not null default now(),
  reconnect_required boolean not null default false
);
create index rf_instagram_connections_app_scoped on public.rf_instagram_connections(app_scoped_id);
create table public.rf_instagram_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_path text not null,
  expires_at timestamptz not null
);
create index rf_instagram_oauth_owner on public.rf_instagram_oauth_states(user_id);
create table public.rf_instagram_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.rf_jobs(id) on delete cascade,
  instagram_user_id text not null,
  username text not null,
  caption text not null default '' check (char_length(caption) <= 2200),
  share_to_feed boolean not null default true,
  status text not null default 'queued' check (status in ('queued','creating','processing','publishing','published','failed','unknown')),
  revision integer not null default 0,
  container_id text,
  media_id text,
  permalink text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, job_id, instagram_user_id)
);
create index rf_instagram_posts_pending on public.rf_instagram_posts(updated_at) where status not in ('published','failed');
create index rf_instagram_posts_job on public.rf_instagram_posts(job_id);
create index rf_instagram_posts_instagram on public.rf_instagram_posts(instagram_user_id);
alter table public.rf_instagram_connections enable row level security;
alter table public.rf_instagram_oauth_states enable row level security;
alter table public.rf_instagram_posts enable row level security;
revoke all on public.rf_instagram_connections, public.rf_instagram_oauth_states, public.rf_instagram_posts from public, anon, authenticated;
grant all on public.rf_instagram_connections, public.rf_instagram_oauth_states, public.rf_instagram_posts to service_role;
