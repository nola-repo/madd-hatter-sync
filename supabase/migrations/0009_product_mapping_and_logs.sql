-- Product Mappings and Execution Sync Logs tables for Madd Hatter POS Sync
-- Safe to re-run idempotently

-- =====================================================================
-- 1. product_mappings: canonical Clover item -> CRM product tag/custom object mapping
-- =====================================================================
create table if not exists public.product_mappings (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_item_id text not null,
  item_name text not null,
  normalized_item_name text not null,
  category_id text,
  category_name text,
  price_cents bigint default 0,
  canonical_product_name text not null,
  purchase_tag_name text not null,
  ghl_mapping_status text not null default 'ready', -- ready | mapped | needs_review | inactive
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_item_id)
);

create index if not exists product_mappings_merchant_item_idx
  on public.product_mappings (clover_merchant_id, clover_item_id);
create index if not exists product_mappings_normalized_name_idx
  on public.product_mappings (normalized_item_name);

alter table public.product_mappings enable row level security;
drop policy if exists deny_anon_product_mappings on public.product_mappings;
create policy deny_anon_product_mappings on public.product_mappings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- =====================================================================
-- 2. sync_logs: detailed step-by-step correlation logs for every operation
-- =====================================================================
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null,
  clover_merchant_id text not null,
  operation text not null, -- CLOVER_EVENT_RECEIVED | CLOVER_ORDER_FETCH | CLOVER_CUSTOMER_RESOLVED | CLOVER_ITEM_RESOLVED | GHL_CONTACT_LOOKUP | GHL_CONTACT_MATCHED | GHL_TAG_LOOKUP | GHL_TAG_APPLIED | GHL_TAG_VERIFIED | GHL_OBJECT_SCHEMA | GHL_PURCHASE_SEARCH | GHL_OBJECT_CREATE | GHL_OBJECT_VERIFY | GHL_ASSOCIATION_LOOKUP | GHL_RELATION_CREATE | GHL_RELATION_VERIFY | FINAL_SYNC
  status text not null, -- info | success | error | warning | retry
  clover_order_id text,
  clover_customer_id text,
  clover_item_id text,
  purchase_reference text,
  ghl_contact_id text,
  ghl_tag_name text,
  ghl_object_record_id text,
  http_method text,
  endpoint text,
  http_status int,
  duration_ms int,
  retry_count int default 0,
  error_message text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_logs_correlation_idx on public.sync_logs (correlation_id);
create index if not exists sync_logs_order_idx on public.sync_logs (clover_order_id);
create index if not exists sync_logs_customer_idx on public.sync_logs (clover_customer_id);
create index if not exists sync_logs_status_idx on public.sync_logs (status);

alter table public.sync_logs enable row level security;
drop policy if exists deny_anon_sync_logs on public.sync_logs;
create policy deny_anon_sync_logs on public.sync_logs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
