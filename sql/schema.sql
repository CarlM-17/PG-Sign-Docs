-- PG Docs Sign - Schema (prefix: pgds_)
-- Run this in Supabase SQL Editor once.

-- 1. Profiles table (linked to auth.users)
create table if not exists pgds_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  store_number text,
  role text not null default 'staff' check (role in ('staff','admin')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  created_at timestamptz default now(),
  approved_at timestamptz,
  approved_by uuid
);

-- 2. Documents table
create table if not exists pgds_documents (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete cascade,
  store_number text,
  title text not null,
  notes text,
  urgency text default 'normal' check (urgency in ('low','normal','high','urgent')),
  original_file_path text not null,
  signed_file_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  signed_by uuid,
  signed_at timestamptz,
  reject_reason text,
  created_at timestamptz default now()
);

-- 3. Reusable signatures (admin's saved signatures)
create table if not exists pgds_signatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_data text not null,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- 4. Activity log
create table if not exists pgds_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  document_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists pgds_documents_uploader_idx on pgds_documents(uploader_id);
create index if not exists pgds_documents_status_idx on pgds_documents(status);
create index if not exists pgds_documents_created_idx on pgds_documents(created_at desc);
create index if not exists pgds_profiles_status_idx on pgds_profiles(status);

-- Auto-create profile row when a user signs up
create or replace function pgds_handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into pgds_profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists pgds_on_auth_user_created on auth.users;
create trigger pgds_on_auth_user_created
  after insert on auth.users
  for each row execute function pgds_handle_new_user();

-- Helper functions (SECURITY DEFINER bypasses RLS to avoid recursion)
create or replace function pgds_is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from pgds_profiles where id = auth.uid() and role = 'admin' and status = 'approved');
$$;

create or replace function pgds_is_approved()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (select 1 from pgds_profiles where id = auth.uid() and status = 'approved');
$$;

grant execute on function pgds_is_admin() to authenticated;
grant execute on function pgds_is_approved() to authenticated;

-- Row-Level Security
alter table pgds_profiles enable row level security;
alter table pgds_documents enable row level security;
alter table pgds_signatures enable row level security;
alter table pgds_activity enable row level security;

drop policy if exists pgds_profiles_self_read on pgds_profiles;
create policy pgds_profiles_self_read on pgds_profiles
  for select using (auth.uid() = id);

drop policy if exists pgds_profiles_admin_read on pgds_profiles;
create policy pgds_profiles_admin_read on pgds_profiles
  for select using (pgds_is_admin());

drop policy if exists pgds_profiles_self_update on pgds_profiles;
create policy pgds_profiles_self_update on pgds_profiles
  for update using (auth.uid() = id);

drop policy if exists pgds_profiles_admin_update on pgds_profiles;
create policy pgds_profiles_admin_update on pgds_profiles
  for update using (pgds_is_admin());

drop policy if exists pgds_docs_uploader_read on pgds_documents;
create policy pgds_docs_uploader_read on pgds_documents
  for select using (auth.uid() = uploader_id);

drop policy if exists pgds_docs_admin_read on pgds_documents;
create policy pgds_docs_admin_read on pgds_documents
  for select using (pgds_is_admin());

drop policy if exists pgds_docs_insert_self on pgds_documents;
create policy pgds_docs_insert_self on pgds_documents
  for insert with check (auth.uid() = uploader_id and pgds_is_approved());

drop policy if exists pgds_docs_admin_update on pgds_documents;
create policy pgds_docs_admin_update on pgds_documents
  for update using (pgds_is_admin());

drop policy if exists pgds_sigs_owner_all on pgds_signatures;
create policy pgds_sigs_owner_all on pgds_signatures
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists pgds_activity_admin_read on pgds_activity;
create policy pgds_activity_admin_read on pgds_activity
  for select using (pgds_is_admin());

-- Storage buckets
insert into storage.buckets (id, name, public) values ('pgds-pending', 'pgds-pending', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('pgds-signed', 'pgds-signed', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('pgds-rejected', 'pgds-rejected', false) on conflict do nothing;

drop policy if exists pgds_storage_pending_insert on storage.objects;
create policy pgds_storage_pending_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'pgds-pending' and pgds_is_approved());

drop policy if exists pgds_storage_read_own on storage.objects;
create policy pgds_storage_read_own on storage.objects
  for select to authenticated using (
    bucket_id in ('pgds-pending','pgds-signed','pgds-rejected')
    and (owner = auth.uid() or pgds_is_admin())
  );

-- Bootstrap: after signing up, promote yourself:
--   update pgds_profiles set role='admin', status='approved' where email='YOUR_EMAIL_HERE';
