alter table models add column if not exists product_id uuid references products(id);
