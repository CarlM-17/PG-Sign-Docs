-- Phase 2 additions: uploader FK + store_name column

-- 1. Re-point uploader FK to pgds_profiles so joins work
alter table pgds_documents
  drop constraint if exists pgds_documents_uploader_id_fkey;
alter table pgds_documents
  add constraint pgds_documents_uploader_id_fkey
  foreign key (uploader_id) references pgds_profiles(id) on delete cascade;

-- 2. Add store_name column (separate from store_number)
alter table pgds_profiles
  add column if not exists store_name text;

-- 3. FK for approved_by so we can join to the approver's profile
alter table pgds_profiles
  drop constraint if exists pgds_profiles_approved_by_fkey;
alter table pgds_profiles
  add constraint pgds_profiles_approved_by_fkey
  foreign key (approved_by) references pgds_profiles(id) on delete set null;
