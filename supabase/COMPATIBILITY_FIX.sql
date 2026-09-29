-- WMS compatibility repair for existing Supabase databases
-- Safe to run multiple times.

-- Warehouses expected by current API/UI
alter table if exists public.warehouses
  add column if not exists is_active boolean not null default true,
  add column if not exists is_primary boolean not null default false,
  add column if not exists location text,
  add column if not exists description text,
  add column if not exists status text not null default 'Active',
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Products expected by current API/UI
alter table if exists public.products
  add column if not exists image_url text,
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists unit text default 'pcs',
  add column if not exists quantity numeric(18,3) default 0,
  add column if not exists min_stock numeric(18,3) default 0,
  add column if not exists purchase_price numeric(18,2) default 0,
  add column if not exists selling_price numeric(18,2) default 0,
  add column if not exists currency text default 'AFN',
  add column if not exists is_active boolean default true,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

-- Stock movements expected by stockController and warehouse history
alter table if exists public.stock_movements
  add column if not exists product_id uuid references public.products(id),
  add column if not exists movement_type text,
  add column if not exists quantity numeric(18,3) default 0,
  add column if not exists balance_after numeric(18,3) default 0,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists notes text,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_at timestamptz default now();

-- Make the first active warehouse primary if none is marked primary.
update public.warehouses
set is_primary = true
where id = (
  select id from public.warehouses
  where coalesce(is_active, true) = true
  order by created_at asc nulls last, id asc
  limit 1
)
and not exists (select 1 from public.warehouses where is_primary = true);

-- Backfill null stock movement balances for old rows where possible.
update public.stock_movements sm
set balance_after = coalesce(p.quantity, 0)
from public.products p
where sm.product_id = p.id and sm.balance_after is null;

-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';


-- Multi-warehouse inventory compatibility
alter table public.products
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;
create index if not exists products_warehouse_idx on public.products(warehouse_id, is_active, created_at desc);
update public.products
set warehouse_id = (select id from public.warehouses where is_active = true order by is_primary desc, created_at asc limit 1)
where warehouse_id is null;
notify pgrst, 'reload schema';


-- 2026-09-19 compatibility fixes
alter table if exists public.profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists permissions_mode text not null default 'custom';

alter table if exists public.representatives
  add column if not exists account_currency text not null default 'USD';

alter table if exists public.recycle_bin
  add column if not exists original_table text;
update public.recycle_bin set original_table = case entity_type
  when 'warehouse' then 'warehouses' when 'debtor' then 'customers'
  when 'product' then 'products' when 'representative' then 'representatives'
  else original_table end where original_table is null;
notify pgrst, 'reload schema';
