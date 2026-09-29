-- ============================================================================
-- Clover <-> GHL Middleware: Supabase schema migration
-- Run this in the Supabase SQL editor for your project.
-- ============================================================================

-- Enable extensions
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- customer_mappings: Clover merchant/customer -> GHL contact
-- ----------------------------------------------------------------------------
create table if not exists public.customer_mappings (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_customer_id text not null,
  ghl_contact_id text not null,
  matched_by text not null default 'existing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_customer_id)
);

create index if not exists idx_customer_mappings_ghl
  on public.customer_mappings (ghl_contact_id);

-- ----------------------------------------------------------------------------
-- orders: one row per Clover order (deduped by merchant+order id)
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_order_id text not null,
  clover_customer_id text,
  ghl_contact_id text,
  status text not null default 'pending', -- pending | in_progress | synced | held_for_review | error
  payment_status text not null default 'UNKNOWN',
  currency text not null default 'USD',
  total_cents integer not null default 0,
  created_time bigint not null default 0,
  location_name text,
  review_reason text,
  last_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_order_id)
);

create index if not exists idx_orders_status on public.orders (status);
create index if not exists idx_orders_customer on public.orders (clover_customer_id);

-- ----------------------------------------------------------------------------
-- order_items: one row per Clover receipt line (deduped by purchase_reference)
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  clover_line_item_id text not null,
  clover_item_id text,
  purchase_reference text not null unique,
  ghl_record_id text,
  item_name text not null,
  category text,
  quantity numeric not null default 1,
  unit_price_cents integer not null default 0,
  line_total_cents integer not null default 0,
  currency text not null default 'USD',
  payment_status text not null default 'UNKNOWN',
  status text not null default 'pending', -- pending | synced | held | error
  flag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);
create index if not exists idx_order_items_ghl on public.order_items (ghl_record_id);

-- ----------------------------------------------------------------------------
-- sync_attempts: audit trail of every sync attempt
-- ----------------------------------------------------------------------------
create table if not exists public.sync_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  attempt_number integer not null default 1,
  status text not null default 'in_progress', -- in_progress | synced | partial | held_for_review | error | skipped
  outcome_message text,
  ghl_contact_id text,
  matched_by text,
  items_synced integer not null default 0,
  items_held integer not null default 0,
  error text,
  review_reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (order_id, attempt_number)
);

create index if not exists idx_sync_attempts_order on public.sync_attempts (order_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customer_mappings_touch on public.customer_mappings;
create trigger trg_customer_mappings_touch
  before update on public.customer_mappings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_order_items_touch on public.order_items;
create trigger trg_order_items_touch
  before update on public.order_items
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Concurrency: atomic order lock via conditional status update.
-- try_lock_order(p_order_id) returns true if the order was NOT in_progress and
-- is now set to in_progress; false otherwise.
-- ----------------------------------------------------------------------------
create or replace function public.try_lock_order(p_order_id uuid)
returns boolean language plpgsql security definer as $$
declare
  acquired boolean := false;
begin
  update public.orders
    set status = 'in_progress', updated_at = now()
    where id = p_order_id and status <> 'in_progress'
    returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- The application talks to Supabase with the SERVICE ROLE key (server-only),
-- which bypasses RLS. We enable RLS anyway so the anon/authenticated keys
-- (which the browser would use if it ever talked to Supabase directly) cannot
-- read or write these tables. Only the service role can.
-- ============================================================================

alter table public.customer_mappings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.sync_attempts enable row level security;

-- Deny all direct browser access. Service role bypasses these policies.
-- Drop first so the migration is safe to re-run (idempotent).
drop policy if exists "deny_anon_customer_mappings" on public.customer_mappings;
drop policy if exists "deny_anon_orders" on public.orders;
drop policy if exists "deny_anon_order_items" on public.order_items;
drop policy if exists "deny_anon_sync_attempts" on public.sync_attempts;

create policy "deny_anon_customer_mappings" on public.customer_mappings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_orders" on public.orders
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_order_items" on public.order_items
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "deny_anon_sync_attempts" on public.sync_attempts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ============================================================================
-- Admin user creation (run once, after creating your Supabase project):
--   1. In Supabase Dashboard > Authentication > Users, click "Add user".
--   2. Enter the admin email + a strong password, and confirm the user.
--   3. (Optional) Disable "Confirm user" auto-confirm off if you want email
--      confirmation. For a sandbox admin, manual confirmation is fine.
-- No SQL is needed to create the user — use the dashboard UI.
-- ============================================================================
