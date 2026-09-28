-- Enhanced audit trail + status model for the Clover → GHL purchase mapping pipeline.
-- Adds: match audit log, tag verification tracking, processing checkpoints.
-- Safe to re-run (idempotent drops before creates).

-- =====================================================================
-- 1. customer_mappings: add verification + evidence columns
-- =====================================================================
alter table public.customer_mappings
  add column if not exists match_method text,            -- email | phone | email_phone | mapping | name_review
  add column if not exists match_evidence jsonb,         -- { email, phone, ghlEmail, ghlPhone, candidates }
  add column if not exists verified_at timestamptz,
  add column if not exists last_checked_at timestamptz,
  add column if not exists clover_email text,
  add column if not exists clover_phone text,
  add column if not exists ghl_email text,
  add column if not exists ghl_phone text;

-- =====================================================================
-- 2. match_audit_log: every automated match decision is recorded
-- =====================================================================
create table if not exists public.match_audit_log (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_customer_id text not null,
  clover_order_id text,
  clover_line_item_id text,
  clover_item_id text,
  ghl_contact_id text,
  match_status text not null,         -- VERIFIED_MAPPING | MATCHED_EMAIL_PHONE | MATCHED_EMAIL | MATCHED_PHONE | AMBIGUOUS_MATCH | CONFLICT | NO_MATCH | NO_IDENTIFIERS | NEEDS_REVIEW | NO_CUSTOMER
  match_method text,
  match_evidence jsonb,
  expected_tag text,
  ghl_tag_id text,
  tag_status text not null default 'not_applicable',  -- not_applicable | pending | applied | verified | failed | out_of_sync
  attempt_count int not null default 1,
  last_attempt_at timestamptz not null default now(),
  last_success_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists match_audit_customer_idx
  on public.match_audit_log (clover_customer_id);
create index if not exists match_audit_status_idx
  on public.match_audit_log (match_status);
create index if not exists match_audit_tag_status_idx
  on public.match_audit_log (tag_status);
create index if not exists match_audit_item_idx
  on public.match_audit_log (clover_item_id);

alter table public.match_audit_log enable row level security;
drop policy if exists deny_anon_match_audit on public.match_audit_log;
create policy deny_anon_match_audit on public.match_audit_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- =====================================================================
-- 3. purchase_tags: add verification columns
-- =====================================================================
alter table public.purchase_tags
  add column if not exists verified_at timestamptz,
  add column if not exists verification_status text not null default 'pending',  -- pending | verified | failed | out_of_sync
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists match_method text;

-- =====================================================================
-- 4. orders: add mapping_status for meaningful display
-- =====================================================================
alter table public.orders
  add column if not exists mapping_status text,          -- MATCHED | NO_MATCH | NO_CUSTOMER | NO_IDENTIFIERS | AMBIGUOUS | CONFLICT | NEEDS_REVIEW | UNMATCHED
  add column if not exists match_method text,
  add column if not exists processed_at timestamptz;

-- Index for finding unprocessed orders efficiently.
create index if not exists orders_mapping_status_idx
  on public.orders (mapping_status);
create index if not exists orders_processed_at_idx
  on public.orders (processed_at);

-- =====================================================================
-- 5. sync_checkpoints: track which orders have been processed
-- =====================================================================
create table if not exists public.sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_order_id text not null,
  clover_line_item_id text,
  processed_at timestamptz not null default now(),
  status text not null,               -- processed | skipped | failed
  unique (clover_merchant_id, clover_order_id, clover_line_item_id)
);

create index if not exists sync_checkpoint_order_idx
  on public.sync_checkpoints (clover_order_id);

alter table public.sync_checkpoints enable row level security;
drop policy if exists deny_anon_sync_checkpoints on public.sync_checkpoints;
create policy deny_anon_sync_checkpoints on public.sync_checkpoints
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
