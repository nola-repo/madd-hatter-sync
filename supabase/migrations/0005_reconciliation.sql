-- ============================================================================
-- 0005_reconciliation.sql
-- Adds refund tracking + payment result/void columns so sales totals can be
-- reconciled against Clover (paid vs refunded vs voided).
-- Safe to re-run (add column if not exists / create table if not exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- refunds: Clover refunds (separate from payments)
-- ----------------------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_refund_id text not null,
  clover_order_id text,
  clover_payment_id text,
  amount_cents integer not null default 0,
  tax_amount_cents integer not null default 0,
  tip_amount_cents integer not null default 0,
  currency text not null default 'USD',
  created_time bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clover_merchant_id, clover_refund_id)
);

create index if not exists idx_refunds_order on public.refunds (clover_order_id);
create index if not exists idx_refunds_payment on public.refunds (clover_payment_id);
create index if not exists idx_refunds_created on public.refunds (created_time);

-- ----------------------------------------------------------------------------
-- payments: capture Clover payment result + voided flag
-- Clover payment.result = SUCCESS | FAILED | PENDING | VOIDED.
-- Only SUCCESS payments represent captured funds.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists result text,
  add column if not exists voided boolean not null default false,
  add column if not exists refunded_amount_cents integer not null default 0;

-- ----------------------------------------------------------------------------
-- orders: void flag + net total (total - refunds) for reconciliation
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists voided boolean not null default false,
  add column if not exists net_total_cents integer not null default 0;

-- ----------------------------------------------------------------------------
-- RLS: deny anon access to refunds
-- ----------------------------------------------------------------------------
do $$ begin
  execute 'drop policy if exists deny_anon_refunds on public.refunds;';
  execute 'create policy deny_anon_refunds on public.refunds for all using (false) with check (false);';
end $$;

-- ----------------------------------------------------------------------------
-- updated_at trigger for refunds
-- ----------------------------------------------------------------------------
drop trigger if exists trg_refunds_touch on public.refunds;
create trigger trg_refunds_touch before update on public.refunds
  for each row execute function public.touch_updated_at();
