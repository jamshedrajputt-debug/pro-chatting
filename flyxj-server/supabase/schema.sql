-- FlyXJ persistent storage schema (DRAFT: not applied until a Supabase project is chosen).
-- Run server-side only. Keep all secret keys exclusively in Render environment variables.
begin;
create table if not exists public.flyxj_state (
  namespace text primary key check(namespace in ('orders','direct_chat','staff_accounts','settings')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.flyxj_state enable row level security;
revoke all on table public.flyxj_state from public, anon, authenticated;
grant select, insert, update, delete on public.flyxj_state to service_role;
-- No SELECT/INSERT/UPDATE/DELETE policy for anon or authenticated:
-- the existing FlyXJ Express server authenticates User A and B.
-- Only the server's service-role key can read/write app-wide records.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('flyxj-private','flyxj-private',false,31457280,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
commit;
