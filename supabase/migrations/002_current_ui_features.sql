-- WMS Pro - Current UI database additions
-- Run this once in Supabase SQL Editor AFTER 001_complete_schema.sql.

create extension if not exists pgcrypto;

alter table public.customers add column if not exists photo text;
alter table public.customers add column if not exists debt_status text not null default 'active';
alter table public.customers add column if not exists bad_debt_at timestamptz;

create table if not exists public.debtor_balance_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null default 'bill_transfer' check (type in ('bill_transfer','goods_credit')),
  amount numeric(18,2) not null check (amount > 0),
  amount_words text,
  record_date date not null default current_date,
  date_shamsi text,
  bill_number text,
  bill_image text,
  bill_image_name text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  description text,
  status text not null default 'Active' check (status in ('Active','Inactive')),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.warehouses (name, location, description, status, is_primary)
select 'Main Warehouse', 'Main Location', 'Primary warehouse for all products and stock operations.', 'Active', true
where not exists (select 1 from public.warehouses where is_primary = true);

create table if not exists public.representative_receipts (
  id uuid primary key default gen_random_uuid(),
  representative_id uuid not null references public.representatives(id) on delete cascade,
  receipt_number text not null,
  amount numeric(18,2) not null check (amount > 0),
  payment_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (representative_id, receipt_number)
);

alter table public.representative_deliveries add column if not exists details text;
alter table public.representative_deliveries add column if not exists location text;
alter table public.representative_deliveries add column if not exists shop_address text;
alter table public.representative_deliveries add column if not exists last_delivered_at timestamptz;
alter table public.representative_deliveries add column if not exists delivery_history jsonb not null default '[]'::jsonb;
alter table public.representative_deliveries add column if not exists bill_name text;
alter table public.representative_deliveries add column if not exists bill_type text;
alter table public.representative_deliveries add column if not exists bill_data_url text;
alter table public.representative_deliveries add column if not exists bill_uploaded_at timestamptz;

create table if not exists public.recycle_bin (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text,
  label text,
  data jsonb not null default '{}'::jsonb,
  deleted_by jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now()
);

alter table public.warehouses enable row level security;
alter table public.debtor_balance_records enable row level security;
alter table public.representative_receipts enable row level security;
alter table public.recycle_bin enable row level security;

create index if not exists debtor_balance_customer_idx on public.debtor_balance_records(customer_id, created_at desc);
create index if not exists warehouse_active_idx on public.warehouses(is_active, created_at);
create index if not exists representative_receipts_idx on public.representative_receipts(representative_id, payment_date desc);
create index if not exists recycle_bin_deleted_idx on public.recycle_bin(deleted_at desc);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'representative_deliveries_rent_type_check'
  ) then
    alter table public.representative_deliveries drop constraint representative_deliveries_rent_type_check;
  end if;
exception when others then null;
end $$;

alter table public.representative_deliveries
  add constraint representative_deliveries_rent_type_check
  check (rent_type in ('cbm','kg','fixed','ton'));
