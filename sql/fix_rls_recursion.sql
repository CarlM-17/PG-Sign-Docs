-- FIX: infinite recursion in pgds_profiles RLS policies
-- Run this in Supabase SQL Editor (Store Notes project) ONCE.

-- 1. Drop the recursive policies
drop policy if exists pgds_profiles_admin_read on pgds_profiles;
drop policy if exists pgds_profiles_admin_update on pgds_profiles;
drop policy if exists pgds_docs_admin_read on pgds_documents;
drop policy if exists pgds_docs_admin_update on pgds_documents;
drop policy if exists pgds_docs_insert_self on pgds_documents;
drop policy if exists pgds_activity_admin_read on pgds_activity;
drop policy if exists pgds_storage_pending_insert on storage.objects;
drop policy if exists pgds_storage_read_own on storage.objects;

-- 2. Helper function: is the current user an approved admin?
-- SECURITY DEFINER makes it run as the function owner, bypassing RLS.
create or replace function pgds_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pgds_profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'approved'
  );
$$;

-- Helper: is the current user approved (any role)?
create or replace function pgds_is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from pgds_profiles
    where id = auth.uid()
      and status = 'approved'
  );
$$;

grant execute on function pgds_is_admin() to authenticated;
grant execute on function pgds_is_approved() to authenticated;

-- 3. Recreate policies using the helper (no recursion)
create policy pgds_profiles_admin_read on pgds_profiles
  for select using (pgds_is_admin());

create policy pgds_profiles_admin_update on pgds_profiles
  for update using (pgds_is_admin());

create policy pgds_docs_admin_read on pgds_documents
  for select using (pgds_is_admin());

create policy pgds_docs_admin_update on pgds_documents
  for update using (pgds_is_admin());

create policy pgds_docs_insert_self on pgds_documents
  for insert with check (
    auth.uid() = uploader_id
    and pgds_is_approved()
  );

create policy pgds_activity_admin_read on pgds_activity
  for select using (pgds_is_admin());

create policy pgds_storage_pending_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'pgds-pending'
    and pgds_is_approved()
  );

create policy pgds_storage_read_own on storage.objects
  for select to authenticated using (
    bucket_id in ('pgds-pending','pgds-signed','pgds-rejected')
    and (owner = auth.uid() or pgds_is_admin())
  );
