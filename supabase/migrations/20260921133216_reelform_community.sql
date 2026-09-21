-- Only the server API may publish. Drafts and uploader identifiers are never
-- exposed through the public Data API. Storage remains private throughout.
create table public.rf_community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  content_type text not null check (content_type in ('video/mp4', 'video/webm')),
  bytes bigint not null check (bytes between 16 and 52428800),
  status text not null default 'uploading' check (status in ('uploading','published','deleted')),
  title text not null default '' check (char_length(title) <= 80),
  creator text not null default '' check (char_length(creator) <= 40),
  caption text not null default '' check (char_length(caption) <= 500),
  ai_assisted boolean not null default true,
  rights_accepted_at timestamptz,
  rights_version text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (storage_path = user_id::text || '/' || id::text || case when content_type = 'video/mp4' then '.mp4' else '.webm' end),
  check (status <> 'published' or (length(trim(title)) > 0 and length(trim(creator)) > 0 and rights_accepted_at is not null and rights_version is not null and published_at is not null))
);
create index rf_community_feed on public.rf_community_posts(published_at desc, id desc) where status = 'published';
create index rf_community_owner on public.rf_community_posts(user_id, created_at desc);
create index rf_community_cleanup on public.rf_community_posts(created_at) where status in ('uploading', 'deleted');
alter table public.rf_community_posts enable row level security;
revoke all on public.rf_community_posts from public, anon, authenticated;
grant all on public.rf_community_posts to service_role;

-- Serialize per-owner reservations so concurrent requests cannot bypass quota.
create function public.rf_community_upload_quota() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 814));
  if (select count(*) from public.rf_community_posts where user_id = new.user_id and created_at > now() - interval '24 hours') >= 10
    or (select count(*) from public.rf_community_posts where user_id = new.user_id and status <> 'deleted') >= 50 then
    raise exception 'community_quota';
  end if;
  return new;
end;
$$;
revoke all on function public.rf_community_upload_quota() from public, anon, authenticated;
grant execute on function public.rf_community_upload_quota() to service_role;
create trigger rf_community_upload_quota before insert on public.rf_community_posts
for each row execute function public.rf_community_upload_quota();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reelform-community', 'reelform-community', false, 52428800, array['video/mp4','video/webm']);
