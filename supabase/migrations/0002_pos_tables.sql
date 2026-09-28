-- ============================================================================
-- Madd Hatter POS Sync: extended normalized POS tables
-- Run after 0001_init.sql. Safe to re-run (if not exists / or replace).
-- These tables back the Clover ingestion layer (ingestion.server.ts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- customers: normalized Clover customers
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_customer_id text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  marketing_allowed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_customer_id)
);

create index if not exists idx_customers_email on public.customers (lower(email));
create index if not exists idx_customers_phone on public.customers (phone);

-- ----------------------------------------------------------------------------
-- products: Clover inventory items
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_item_id text not null,
  name text,
  sku text,
  price_cents integer not null default 0,
  clover_category_id text,
  category_name text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_item_id)
);

create index if not exists idx_products_category on public.products (clover_category_id);

-- ----------------------------------------------------------------------------
-- categories: Clover inventory categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_category_id text not null,
  name text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_category_id)
);

-- ----------------------------------------------------------------------------
-- employees: Clover employees
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_employee_id text not null,
  name text,
  email text,
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_employee_id)
);

-- ----------------------------------------------------------------------------
-- payments: Clover payments (transactions)
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_payment_id text not null,
  clover_order_id text,
  clover_employee_id text,
  amount_cents integer not null default 0,
  tax_amount_cents integer not null default 0,
  tip_amount_cents integer not null default 0,
  cash_tendered_cents integer not null default 0,
  payment_type text,
  result text,
  card_type text,
  currency text not null default 'USD',
  created_time bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_payment_id)
);

create index if not exists idx_payments_order on public.payments (clover_order_id);
create index if not exists idx_payments_created on public.payments (created_time);

-- ----------------------------------------------------------------------------
-- discounts: Clover discount definitions
-- ----------------------------------------------------------------------------
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_discount_id text not null,
  name text,
  amount_cents integer not null default 0,
  percentage double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_discount_id)
);

-- ----------------------------------------------------------------------------
-- modifier_groups: Clover modifier groups
-- ----------------------------------------------------------------------------
create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_modifier_group_id text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_modifier_group_id)
);

-- ----------------------------------------------------------------------------
-- modifiers: Clover modifiers
-- ----------------------------------------------------------------------------
create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_modifier_id text not null,
  clover_modifier_group_id text,
  name text,
  price_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_modifier_id)
);

create index if not exists idx_modifiers_group on public.modifiers (clover_modifier_group_id);

-- ----------------------------------------------------------------------------
-- sync_runs: ingestion run history (one row per Refresh POS Data click)
-- ----------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  kind text not null default 'incremental',
  status text not null default 'running',
  range_start bigint,
  range_end bigint,
  orders_fetched integer not null default 0,
  orders_upserted integer not null default 0,
  order_items_fetched integer not null default 0,
  order_items_upserted integer not null default 0,
  customers_fetched integer not null default 0,
  customers_upserted integer not null default 0,
  payments_fetched integer not null default 0,
  payments_upserted integer not null default 0,
  products_fetched integer not null default 0,
  products_upserted integer not null default 0,
  categories_fetched integer not null default 0,
  categories_upserted integer not null default 0,
  employees_fetched integer not null default 0,
  employees_upserted integer not null default 0,
  modifiers_fetched integer not null default 0,
  discounts_fetched integer not null default 0,
  errors jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_sync_runs_started on public.sync_runs (started_at desc);

-- ----------------------------------------------------------------------------
-- Extend orders table with columns used by the ingestion layer + order detail
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists clover_employee_id text,
  add column if not exists order_type text,
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists discount_total_cents integer not null default 0,
  add column if not exists tax_total_cents integer not null default 0,
  add column if not exists service_charge_cents integer not null default 0,
  add column if not exists tip_cents integer not null default 0,
  add column if not exists total_refunded_cents integer not null default 0,
  add column if not exists modified_time bigint,
  add column if not exists group_line_items boolean not null default false,
  add column if not exists test_mode boolean not null default false;

create index if not exists idx_orders_employee on public.orders (clover_employee_id);
create index if not exists idx_orders_created on public.orders (created_time);

-- ----------------------------------------------------------------------------
-- Extend order_items with modifiers/discounts JSON + clover category
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists modifiers_json jsonb,
  add column if not exists discounts_json jsonb,
  add column if not exists clover_category_id text;

-- ----------------------------------------------------------------------------
-- RLS: deny anon, allow service role (server uses service-role key).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customers','products','categories','employees','payments',
    'discounts','modifier_groups','modifiers','sync_runs'
  ] loop
    execute format('drop policy if exists deny_anon_%I on public.%I;', t, t);
    execute format(
      'create policy deny_anon_%I on public.%I for all using (false) with check (false);',
      t, t
    );
  end loop;
end$$;

-- orders / order_items already have deny policies from 0001; ensure extended
-- columns are still covered by the existing all-false policy.
drop policy if exists deny_anon_orders on public.orders;
create policy deny_anon_orders on public.orders
  for all using (false) with check (false);

drop policy if exists deny_anon_order_items on public.order_items;
create policy deny_anon_order_items on public.order_items
  for all using (false) with check (false);

-- ----------------------------------------------------------------------------
-- updated_at trigger for new tables
-- ----------------------------------------------------------------------------
drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_categories_touch on public.categories;
create trigger trg_categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_employees_touch on public.employees;
create trigger trg_employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_discounts_touch on public.discounts;
create trigger trg_discounts_touch before update on public.discounts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_modifier_groups_touch on public.modifier_groups;
create trigger trg_modifier_groups_touch before update on public.modifier_groups
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_modifiers_touch on public.modifiers;
create trigger trg_modifiers_touch before update on public.modifiers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_sync_runs_touch on public.sync_runs;
create trigger trg_sync_runs_touch before update on public.sync_runs
  for each row execute function public.touch_updated_at();
