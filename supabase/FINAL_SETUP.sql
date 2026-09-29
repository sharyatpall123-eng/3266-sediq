-- WMS PRO FINAL DATABASE SETUP
-- Paste this whole file into Supabase SQL Editor and Run once.

-- WMS Pro 2.0 - Complete Supabase schema
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  username text not null unique,
  full_name text not null,
  phone text,
  avatar_url text,
  role text not null default 'cashier' check (role in ('administrator','manager','cashier','store_keeper')),
  is_active boolean not null default true,
  permissions jsonb not null default '[]'::jsonb,
  permissions_mode text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, full_name)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@local.invalid'),
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, new.id::text), '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'User'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create table if not exists public.company_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'WMS Pro',
  logo_url text,
  address text,
  phone text,
  email text,
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  date_format text not null default 'yyyy-MM-dd',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.company_settings (id) values (1) on conflict (id) do nothing;

alter table public.company_settings add column if not exists backup_email text;
alter table public.company_settings add column if not exists backup_email_enabled boolean not null default false;
alter table public.company_settings add column if not exists backup_email_frequency text not null default 'weekly';
alter table public.company_settings add column if not exists last_backup_email_at timestamptz;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null unique,
  barcode text unique,
  category text,
  description text,
  image_url text,
  unit text not null default 'pcs',
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  min_stock numeric(18,3) not null default 5 check (min_stock >= 0),
  purchase_price numeric(18,2) not null default 0 check (purchase_price >= 0),
  selling_price numeric(18,2) not null default 0 check (selling_price >= 0),
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists stock_status text generated always as (
    case
      when quantity <= 0 then 'out'
      when quantity <= min_stock then 'low'
      else 'in'
    end
  ) stored;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  current_balance numeric(18,2) not null default 0 check (current_balance >= 0),
  last_payment_date date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  supplier_id uuid references public.suppliers(id),
  invoice_date date not null default current_date,
  total_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  remaining_amount numeric(18,2) not null default 0,
  payment_status text not null default 'paid' check (payment_status in ('paid','partial','credit')),
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(18,3) not null check (quantity > 0),
  purchase_price numeric(18,2) not null check (purchase_price >= 0),
  total_amount numeric(18,2) generated always as (quantity * purchase_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid references public.customers(id),
  invoice_date date not null default current_date,
  due_date date,
  total_amount numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  remaining_amount numeric(18,2) not null default 0,
  payment_status text not null default 'paid' check (payment_status in ('paid','partial','credit')),
  currency text not null default 'AFN' check (currency in ('AFN','USD')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(18,3) not null check (quantity > 0),
  selling_price numeric(18,2) not null check (selling_price >= 0),
  total_amount numeric(18,2) generated always as (quantity * selling_price) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  invoice_id uuid references public.sales_invoices(id),
  amount numeric(18,2) not null check (amount > 0),
  method text not null default 'cash',
  payment_date date not null default current_date,
  notes text,
  received_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  quantity numeric(18,3) not null check (quantity > 0),
  balance_after numeric(18,3) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.representatives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  contact_person text,
  notes text,
  total_goods numeric(18,3) not null default 0,
  delivered_goods numeric(18,3) not null default 0,
  remaining_goods numeric(18,3) not null default 0,
  total_amount numeric(18,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.representative_deliveries (
  id uuid primary key default gen_random_uuid(),
  representative_id uuid not null references public.representatives(id) on delete cascade,
  description text not null,
  quantity numeric(18,3) not null check (quantity > 0),
  delivered_quantity numeric(18,3) not null default 0 check (delivered_quantity >= 0),
  weight_kg numeric(18,3) not null default 0,
  cbm numeric(18,3) not null default 0,
  price numeric(18,2) not null default 0,
  rent_type text not null default 'cbm' check (rent_type in ('cbm','kg','fixed')),
  rent_rate numeric(18,2) not null default 0,
  rent_amount numeric(18,2) not null default 0,
  delivery_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'system',
  title text not null,
  message text not null,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_name_idx on public.products using gin (to_tsvector('simple', name));
create index if not exists products_sku_idx on public.products(sku);
create index if not exists products_barcode_idx on public.products(barcode);
create index if not exists customers_name_idx on public.customers(name);
create index if not exists customers_balance_idx on public.customers(current_balance desc);
create index if not exists sales_invoice_date_idx on public.sales_invoices(invoice_date desc);
create index if not exists purchase_invoice_date_idx on public.purchase_invoices(invoice_date desc);
create index if not exists stock_movement_product_idx on public.stock_movements(product_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(is_read, created_at desc);

-- Updated-at triggers
create or replace function public.create_updated_at_triggers()
returns void language plpgsql as $$
declare table_name text;
begin
  foreach table_name in array array['profiles','company_settings','products','suppliers','customers','purchase_invoices','sales_invoices','representatives','representative_deliveries']
  loop
    execute format('drop trigger if exists %I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;
select public.create_updated_at_triggers();
drop function public.create_updated_at_triggers();

create or replace function public.next_invoice_number(prefix text)
returns text
language sql
volatile
as $$
  select upper(prefix) || '-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISSMS');
$$;

create or replace function public.create_purchase_invoice(payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_total numeric(18,2) := 0;
  v_paid numeric(18,2) := 0;
  v_remaining numeric(18,2) := 0;
  v_status text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity numeric(18,3);
  v_price numeric(18,2);
  v_user uuid := nullif(payload->>'user_id','')::uuid;
begin
  if coalesce(payload->'supplier'->>'name','') = '' then raise exception 'Supplier name is required'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Invoice items are required'; end if;

  select id into v_supplier_id from public.suppliers
  where is_active = true and (
    (coalesce(payload->'supplier'->>'phone','') <> '' and phone = payload->'supplier'->>'phone')
    or lower(name) = lower(payload->'supplier'->>'name')
  ) order by created_at desc limit 1;

  if v_supplier_id is null then
    insert into public.suppliers(name, phone, created_by)
    values (payload->'supplier'->>'name', nullif(payload->'supplier'->>'phone',''), v_user)
    returning id into v_supplier_id;
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    if v_quantity <= 0 or v_price < 0 then raise exception 'Invalid invoice item'; end if;
    v_total := v_total + (v_quantity * v_price);
  end loop;

  v_status := coalesce(payload->>'payment_type','paid');
  v_paid := case when v_status = 'paid' then v_total when v_status = 'partial' then least(coalesce((payload->>'paid_amount')::numeric,0), v_total) else 0 end;
  v_remaining := v_total - v_paid;
  if v_remaining = 0 then v_status := 'paid'; elsif v_paid > 0 then v_status := 'partial'; else v_status := 'credit'; end if;
  v_invoice_number := coalesce(nullif(payload->>'invoice_number',''), public.next_invoice_number('PI'));

  insert into public.purchase_invoices(invoice_number, supplier_id, invoice_date, total_amount, paid_amount, remaining_amount, payment_status, notes, created_by)
  values (v_invoice_number, v_supplier_id, coalesce(nullif(payload->>'date','')::date,current_date), v_total, v_paid, v_remaining, v_status, nullif(payload->>'notes',''), v_user)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'Product not found'; end if;
    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    insert into public.purchase_invoice_items(invoice_id, product_id, quantity, purchase_price) values (v_invoice_id, v_product.id, v_quantity, v_price);
    update public.products set quantity = quantity + v_quantity, purchase_price = v_price where id = v_product.id returning * into v_product;
    insert into public.stock_movements(product_id, movement_type, quantity, balance_after, reference_type, reference_id, notes, created_by)
    values (v_product.id, 'in', v_quantity, v_product.quantity, 'purchase_invoice', v_invoice_id, v_invoice_number, v_user);
  end loop;

  insert into public.notifications(type, title, message, entity_id)
  values ('stock_in', 'New Stock', 'Purchase invoice ' || v_invoice_number || ' ثبت شو.', v_invoice_id);
  insert into public.activity_logs(user_id, action, entity_type, entity_id, details)
  values (v_user, 'stock_in', 'purchase_invoice', v_invoice_id, jsonb_build_object('title','Stock In - ' || v_invoice_number, 'amount',v_total));

  return jsonb_build_object('id',v_invoice_id,'invoice_number',v_invoice_number,'total_amount',v_total,'paid_amount',v_paid,'remaining_amount',v_remaining,'payment_status',v_status);
end;
$$;

create or replace function public.create_sales_invoice(payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_total numeric(18,2) := 0;
  v_paid numeric(18,2) := 0;
  v_remaining numeric(18,2) := 0;
  v_status text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity numeric(18,3);
  v_price numeric(18,2);
  v_user uuid := nullif(payload->>'user_id','')::uuid;
begin
  if coalesce(payload->'customer'->>'name','') = '' then raise exception 'Customer name is required'; end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then raise exception 'Invoice items are required'; end if;

  select id into v_customer_id from public.customers
  where is_active = true and (
    (coalesce(payload->'customer'->>'phone','') <> '' and phone = payload->'customer'->>'phone')
    or lower(name) = lower(payload->'customer'->>'name')
  ) order by created_at desc limit 1;

  if v_customer_id is null then
    insert into public.customers(name, phone, created_by)
    values (payload->'customer'->>'name', nullif(payload->'customer'->>'phone',''), v_user)
    returning id into v_customer_id;
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    if v_quantity <= 0 or v_price < 0 then raise exception 'Invalid invoice item'; end if;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'Product not found'; end if;
    if v_product.quantity < v_quantity then raise exception 'Insufficient stock for %', v_product.name; end if;
    v_total := v_total + (v_quantity * v_price);
  end loop;

  v_status := coalesce(payload->>'payment_type','paid');
  v_paid := case when v_status = 'paid' then v_total when v_status = 'partial' then least(coalesce((payload->>'paid_amount')::numeric,0), v_total) else 0 end;
  v_remaining := v_total - v_paid;
  if v_remaining = 0 then v_status := 'paid'; elsif v_paid > 0 then v_status := 'partial'; else v_status := 'credit'; end if;
  v_invoice_number := coalesce(nullif(payload->>'invoice_number',''), public.next_invoice_number('SI'));

  insert into public.sales_invoices(invoice_number, customer_id, invoice_date, due_date, total_amount, paid_amount, remaining_amount, payment_status, notes, created_by)
  values (v_invoice_number, v_customer_id, coalesce(nullif(payload->>'date','')::date,current_date), coalesce(nullif(payload->>'due_date','')::date,coalesce(nullif(payload->>'date','')::date,current_date) + 30), v_total, v_paid, v_remaining, v_status, nullif(payload->>'notes',''), v_user)
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    v_quantity := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price')::numeric;
    insert into public.sales_invoice_items(invoice_id, product_id, quantity, selling_price) values (v_invoice_id, v_product.id, v_quantity, v_price);
    update public.products set quantity = quantity - v_quantity, selling_price = v_price where id = v_product.id returning * into v_product;
    insert into public.stock_movements(product_id, movement_type, quantity, balance_after, reference_type, reference_id, notes, created_by)
    values (v_product.id, 'out', v_quantity, v_product.quantity, 'sales_invoice', v_invoice_id, v_invoice_number, v_user);
    if v_product.quantity <= v_product.min_stock then
      insert into public.notifications(type, title, message, entity_id)
      values ('low_stock', 'Low Stock Alert', v_product.name || ' سټاک ' || v_product.quantity || ' ته کم شو.', v_product.id);
    end if;
  end loop;

  update public.customers set current_balance = current_balance + v_remaining,
    last_payment_date = case when v_paid > 0 then coalesce(nullif(payload->>'date','')::date,current_date) else last_payment_date end
  where id = v_customer_id;

  if v_paid > 0 then
    insert into public.payments(customer_id, invoice_id, amount, method, payment_date, notes, received_by)
    values (v_customer_id, v_invoice_id, v_paid, coalesce(payload->>'payment_method','cash'), coalesce(nullif(payload->>'date','')::date,current_date), 'Invoice initial payment', v_user);
  end if;

  insert into public.notifications(type, title, message, entity_id)
  values ('stock_out', 'Stock Out', 'Sales invoice ' || v_invoice_number || ' ثبت شو.', v_invoice_id);
  insert into public.activity_logs(user_id, action, entity_type, entity_id, details)
  values (v_user, 'stock_out', 'sales_invoice', v_invoice_id, jsonb_build_object('title','Stock Out - ' || v_invoice_number, 'amount',v_total));

  return jsonb_build_object('id',v_invoice_id,'invoice_number',v_invoice_number,'total_amount',v_total,'paid_amount',v_paid,'remaining_amount',v_remaining,'payment_status',v_status);
end;
$$;

create or replace function public.record_customer_payment(payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_invoice public.sales_invoices%rowtype;
  v_amount numeric(18,2) := (payload->>'amount')::numeric;
  v_remaining_payment numeric(18,2);
  v_apply numeric(18,2);
  v_user uuid := nullif(payload->>'user_id','')::uuid;
begin
  select * into v_customer from public.customers where id = (payload->>'customer_id')::uuid for update;
  if not found then raise exception 'Customer not found'; end if;
  if v_amount <= 0 or v_amount > v_customer.current_balance then raise exception 'Payment amount exceeds balance'; end if;
  v_remaining_payment := v_amount;

  for v_invoice in
    select * from public.sales_invoices
    where customer_id = v_customer.id and remaining_amount > 0
    order by invoice_date, created_at
    for update
  loop
    exit when v_remaining_payment <= 0;
    v_apply := least(v_remaining_payment, v_invoice.remaining_amount);
    insert into public.payments(customer_id, invoice_id, amount, method, payment_date, notes, received_by)
    values (v_customer.id, v_invoice.id, v_apply, coalesce(payload->>'method','cash'), coalesce(nullif(payload->>'payment_date','')::date,current_date), nullif(payload->>'notes',''), v_user);
    update public.sales_invoices set
      paid_amount = paid_amount + v_apply,
      remaining_amount = remaining_amount - v_apply,
      payment_status = case when remaining_amount - v_apply <= 0 then 'paid' else 'partial' end
    where id = v_invoice.id;
    v_remaining_payment := v_remaining_payment - v_apply;
  end loop;

  update public.customers set current_balance = greatest(0,current_balance-v_amount), last_payment_date = coalesce(nullif(payload->>'payment_date','')::date,current_date) where id = v_customer.id;
  insert into public.notifications(type,title,message,entity_id) values ('payment','Payment Received',v_customer.name || ' څخه ' || v_amount || ' وصول شول.',v_customer.id);
  insert into public.activity_logs(user_id,action,entity_type,entity_id,details) values (v_user,'payment_received','customer',v_customer.id,jsonb_build_object('title','Payment Received - ' || v_customer.name,'amount',v_amount));
  return jsonb_build_object('customer_id',v_customer.id,'amount',v_amount,'remaining_balance',greatest(0,v_customer.current_balance-v_amount));
end;
$$;

create or replace function public.add_representative_delivery(payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_quantity numeric(18,3) := (payload->>'quantity')::numeric;
  v_weight numeric(18,3) := coalesce((payload->>'weight_kg')::numeric,0);
  v_cbm numeric(18,3) := coalesce((payload->>'cbm')::numeric,0);
  v_rate numeric(18,2) := coalesce((payload->>'rent_rate')::numeric,0);
  v_price numeric(18,2) := coalesce((payload->>'price')::numeric,0);
  v_rent numeric(18,2);
  v_type text := coalesce(payload->>'rent_type','cbm');
begin
  v_rent := case when v_type='kg' then v_weight*v_rate when v_type='fixed' then v_rate else v_cbm*v_rate end;
  insert into public.representative_deliveries(representative_id,description,quantity,weight_kg,cbm,price,rent_type,rent_rate,rent_amount,delivery_date,notes,created_by)
  values ((payload->>'representative_id')::uuid,payload->>'description',v_quantity,v_weight,v_cbm,v_price,v_type,v_rate,v_rent,coalesce(nullif(payload->>'delivery_date','')::date,current_date),nullif(payload->>'notes',''),nullif(payload->>'created_by','')::uuid)
  returning id into v_id;
  update public.representatives set total_goods=total_goods+v_quantity,remaining_goods=remaining_goods+v_quantity,total_amount=total_amount+v_price+v_rent where id=(payload->>'representative_id')::uuid;
  return jsonb_build_object('id',v_id,'rent_amount',v_rent,'total_amount',v_price+v_rent);
end;
$$;

-- RLS: the frontend never accesses database tables directly. The Node API uses the service role.
do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','company_settings','products','suppliers','customers','purchase_invoices','purchase_invoice_items','sales_invoices','sales_invoice_items','payments','stock_movements','representatives','representative_deliveries','notifications','activity_logs']
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('company-assets','company-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Public image reading is safe. Uploading/deleting is done only by the Node server with service role.
drop policy if exists "Public product image read" on storage.objects;
create policy "Public product image read" on storage.objects for select using (bucket_id='product-images');
drop policy if exists "Public company asset read" on storage.objects;
create policy "Public company asset read" on storage.objects for select using (bucket_id='company-assets');


-- Compatibility repair for databases created from older WMS builds.
-- Safe to run repeatedly: every column uses IF NOT EXISTS.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists role text not null default 'cashier';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
update public.profiles set username = coalesce(nullif(username,''), split_part(email,'@',1), id::text) where username is null or username='';

alter table public.products add column if not exists name text;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists barcode text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists unit text default 'pcs';
alter table public.products add column if not exists quantity numeric(18,3) default 0;
alter table public.products add column if not exists min_stock numeric(18,3) default 5;
alter table public.products add column if not exists purchase_price numeric(18,2) default 0;
alter table public.products add column if not exists selling_price numeric(18,2) default 0;
alter table public.products add column if not exists currency text default 'AFN';
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists created_by uuid references public.profiles(id);
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

alter table public.purchase_invoices add column if not exists supplier_id uuid references public.suppliers(id);
alter table public.purchase_invoices add column if not exists invoice_date date default current_date;
alter table public.purchase_invoices add column if not exists total_amount numeric(18,2) default 0;
alter table public.purchase_invoices add column if not exists paid_amount numeric(18,2) default 0;
alter table public.purchase_invoices add column if not exists remaining_amount numeric(18,2) default 0;
alter table public.purchase_invoices add column if not exists payment_status text default 'paid';
alter table public.purchase_invoices add column if not exists currency text default 'AFN';
alter table public.purchase_invoices add column if not exists notes text;
alter table public.purchase_invoices add column if not exists created_by uuid references public.profiles(id);
alter table public.purchase_invoices add column if not exists created_at timestamptz default now();
alter table public.purchase_invoices add column if not exists updated_at timestamptz default now();

alter table public.sales_invoices add column if not exists customer_id uuid references public.customers(id);
alter table public.sales_invoices add column if not exists invoice_date date default current_date;
alter table public.sales_invoices add column if not exists due_date date;
alter table public.sales_invoices add column if not exists total_amount numeric(18,2) default 0;
alter table public.sales_invoices add column if not exists paid_amount numeric(18,2) default 0;
alter table public.sales_invoices add column if not exists remaining_amount numeric(18,2) default 0;
alter table public.sales_invoices add column if not exists payment_status text default 'paid';
alter table public.sales_invoices add column if not exists currency text default 'AFN';
alter table public.sales_invoices add column if not exists notes text;
alter table public.sales_invoices add column if not exists created_by uuid references public.profiles(id);
alter table public.sales_invoices add column if not exists created_at timestamptz default now();
alter table public.sales_invoices add column if not exists updated_at timestamptz default now();

-- Reload PostgREST schema after repair so newly added tables/columns are visible immediately.
notify pgrst, 'reload schema';

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


notify pgrst, 'reload schema';


-- Compatibility repair for databases created by older WMS builds
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
