-- Optional demo data. Run after 001_complete_schema.sql and after creating an administrator.
insert into public.products (name, sku, barcode, category, unit, quantity, min_stock, purchase_price, selling_price)
values
  ('HP Laptop', 'HP-LAP-001', '100000001', 'Electronics', 'pcs', 18, 5, 32000, 36500),
  ('Dell Monitor', 'DELL-MON-001', '100000002', 'Electronics', 'pcs', 12, 4, 8500, 9800),
  ('USB Cable', 'USB-CAB-001', '100000003', 'Accessories', 'pcs', 4, 10, 120, 180),
  ('Keyboard', 'KEY-001', '100000004', 'Accessories', 'pcs', 0, 5, 650, 850)
on conflict (sku) do nothing;

insert into public.customers (name, phone, currency, current_balance, last_payment_date)
values
  ('احمد خان', '0700000000', 'AFN', 30000, current_date - 10),
  ('محمد علي', '0799999999', 'AFN', 2000, current_date - 20)
on conflict do nothing;

insert into public.representatives (name, phone, address, total_goods, delivered_goods, remaining_goods)
values
  ('حاجي رحيم', '0701111111', 'کابل', 120, 95, 25),
  ('سپیدار لوژستیک', '0702222222', 'مزار', 95, 80, 15)
on conflict do nothing;
