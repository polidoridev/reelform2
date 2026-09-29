-- Saved uploads: trimmed videos and reference photos people can reuse without
-- uploading them again. Files live in a private bucket; only server routes read them.
create table public.rf_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.rf_accounts on delete cascade,
  kind text not null check (kind in ('video', 'image')),
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null check (content_type in ('video/mp4', 'image/jpeg', 'image/png', 'image/webp')),
  bytes bigint not null check (bytes > 0),
  duration real check (duration is null or duration > 0),
  -- SHA-256 of the file, so choosing the same file again doesn't save a copy.
  hash text not null check (hash ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  -- Higgsfield's copy, reused while it is still available.
  provider_url text,
  provider_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, hash),
  check (storage_path like user_id::text || '/%')
);
create index rf_library_owner on public.rf_library(user_id, kind, last_used_at desc);
alter table public.rf_library enable row level security;
revoke all on public.rf_library from public, anon, authenticated;
grant all on public.rf_library to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('reelform-uploads', 'reelform-uploads', false, 1073741824,
  array['video/mp4', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
