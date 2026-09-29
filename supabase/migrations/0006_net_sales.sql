-- ============================================================================
-- 0006_net_sales.sql
-- Adds net_sales_cents (line-item-derived net sales) so dashboard totals
-- reconcile with Clover's "Net Sales" figure instead of order.total (which
-- is 0 for many Clover orders). Safe to re-run.
-- ============================================================================

alter table public.orders
  add column if not exists net_sales_cents integer not null default 0;

-- Backfill existing rows from order_items where possible.
update public.orders o
  set net_sales_cents = coalesce(
    (select coalesce(sum(line_total_cents), 0) from public.order_items oi where oi.order_id = o.id),
    0
  )
  where o.net_sales_cents = 0;
