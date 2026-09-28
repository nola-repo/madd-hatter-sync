-- ============================================================================
-- Madd Hatter POS Sync: extended schema (customers, products, categories,
-- payments, employees, modifiers, discounts, sync_runs).
-- Idempotent — safe to re-run. Run after 0001_init.sql.
-- ============================================================================
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- customers: normalized Clover customers (deduped by merchant + customer id)
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
create index if not exists idx_customers_email on public.customers (email);
create index if not exists idx_customers_phone on public.customers (phone);

-- ----------------------------------------------------------------------------
-- categories: Clover inventory categories
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_category_id text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_category_id)
);

-- ----------------------------------------------------------------------------
-- products: Clover inventory items
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_item_id text not null,
  name text,
  clover_category_id text,
  category_name text,
  sku text,
  price_cents integer not null default 0,
  price_type text,
  unit_name text,
  stock integer,
  hidden boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_item_id)
);
create index if not exists idx_products_category on public.products (clover_category_id);

-- ----------------------------------------------------------------------------
-- modifier_groups + modifiers
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

-- ----------------------------------------------------------------------------
-- discounts: Clover order/line-item discounts
-- ----------------------------------------------------------------------------
create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_discount_id text not null,
  name text,
  amount_cents integer not null default 0,
  percentage numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_discount_id)
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
-- payments: Clover payments (one order may have multiple)
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

-- ----------------------------------------------------------------------------
-- Extend orders with richer financial + employee fields
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists subtotal_cents integer not null default 0,
  add column if not exists discount_total_cents integer not null default 0,
  add column if not exists tax_total_cents integer not null default 0,
  add column if not exists service_charge_cents integer not null default 0,
  add column if not exists tip_cents integer not null default 0,
  add column if not exists clover_employee_id text,
  add column if not exists order_type text,
  add column if not exists modified_time bigint,
  add column if not exists group_line_items boolean default false,
  add column if not exists test_mode boolean default false,
  add column if not exists total_refunded_cents integer not null default 0;

-- ----------------------------------------------------------------------------
-- Extend order_items with modifier/discount detail + raw fields
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists clover_order_id text,
  add column if not exists clover_merchant_id text,
  add column if not exists modifiers_json jsonb,
  add column if not exists discounts_json jsonb,
  add column if not exists unit_name text,
  add column if not exists note text,
  add column if not exists created_time bigint;

create index if not exists idx_order_items_clover_item on public.order_items (clover_item_id);
create index if not exists idx_order_items_clover_order on public.order_items (clover_order_id);

-- ----------------------------------------------------------------------------
-- sync_runs: import job audit trail (refresh / full sync)
-- ----------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  kind text not null default 'incremental', -- incremental | full
  status text not null default 'running',   -- running | completed | failed
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
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_sync_runs_started on public.sync_runs (started_at desc);

-- ----------------------------------------------------------------------------
-- updated_at triggers for new tables
-- ----------------------------------------------------------------------------
drop trigger if exists trg_customers_touch on public.customers;
create trigger trg_customers_touch
  before update on public.customers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_categories_touch on public.categories;
create trigger trg_categories_touch
  before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_modifier_groups_touch on public.modifier_groups;
create trigger trg_modifier_groups_touch
  before update on public.modifier_groups
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_modifiers_touch on public.modifiers;
create trigger trg_modifiers_touch
  before update on public.modifiers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_discounts_touch on public.discounts;
create trigger trg_discounts_touch
  before update on public.discounts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_employees_touch on public.employees;
create trigger trg_employees_touch
  before update on public.employees
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch
  before update on public.payments
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_sync_runs_touch on public.sync_runs;
create trigger trg_sync_runs_touch
  before update on public.sync_runs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: deny anon/authenticated; service role bypasses.
-- ----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.discounts enable row level security;
alter table public.employees enable row level security;
alter table public.payments enable row level security;
alter table public.sync_runs enable row level security;

drop policy if exists "deny_anon_customers" on public.customers;
drop policy if exists "deny_anon_categories" on public.categories;
drop policy if exists "deny_anon_products" on public.products;
drop policy if exists "deny_anon_modifier_groups" on public.modifier_groups;
drop policy if exists "deny_anon_modifiers" on public.modifiers;
drop policy if exists "deny_anon_discounts" on public.discounts;
drop policy if exists "deny_anon_employees" on public.employees;
drop policy if exists "deny_anon_payments" on public.payments;
drop policy if exists "deny_anon_sync_runs" on public.sync_runs;

create policy "deny_anon_customers" on public.customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_categories" on public.categories
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_products" on public.products
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_modifier_groups" on public.modifier_groups
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_modifiers" on public.modifiers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_discounts" on public.discounts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_employees" on public.employees
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_payments" on public.payments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_sync_runs" on public.sync_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
