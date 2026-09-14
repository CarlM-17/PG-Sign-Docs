-- Phase 2b: Store list managed by admin

create table if not exists pgds_stores (
  id uuid primary key default gen_random_uuid(),
  store_number text unique not null,
  store_name text not null,
  active boolean default true,
  created_at timestamptz default now(),
  created_by uuid references pgds_profiles(id) on delete set null
);

create index if not exists pgds_stores_active_idx on pgds_stores(active);

alter table pgds_stores enable row level security;

-- Anyone signed in (even pending) can READ the store list, so the signup form works
drop policy if exists pgds_stores_read_all on pgds_stores;
create policy pgds_stores_read_all on pgds_stores
  for select using (true);

-- Only admins can insert/update/delete
drop policy if exists pgds_stores_admin_write on pgds_stores;
create policy pgds_stores_admin_write on pgds_stores
  for all using (pgds_is_admin()) with check (pgds_is_admin());

-- Grant anon (public) select so signup page works even before login
grant select on pgds_stores to anon, authenticated;

-- Seed 31 placeholder stores if empty (edit these later in the Stores tab)
insert into pgds_stores (store_number, store_name)
select num::text, 'Store ' || num
from generate_series(1, 31) as num
where not exists (select 1 from pgds_stores);
