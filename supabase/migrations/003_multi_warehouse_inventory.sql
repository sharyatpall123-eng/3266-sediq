-- Multi-warehouse inventory support

alter table public.products
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict;

create index if not exists products_warehouse_idx
  on public.products(warehouse_id, is_active, created_at desc);

-- Assign existing unassigned products to the primary warehouse so old data is preserved.
update public.products
set warehouse_id = (
  select id from public.warehouses
  where is_active = true
  order by is_primary desc, created_at asc
  limit 1
)
where warehouse_id is null;

-- After migration, every new/updated product should belong to a warehouse.
do $$
begin
  if exists (select 1 from public.products where warehouse_id is null) then
    raise notice 'Some products remain without warehouse because no active warehouse exists.';
  else
    alter table public.products alter column warehouse_id set not null;
  end if;
end $$;

notify pgrst, 'reload schema';
