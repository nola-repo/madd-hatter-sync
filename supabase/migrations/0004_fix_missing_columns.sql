-- ============================================================================
-- 0004_fix_missing_columns.sql
-- Adds columns that the ingestion layer (ingestion.server.ts) writes but
-- that were not created by 0001/0002. Without these, PostgREST rejects the
-- products and order_items upserts, so the Items / Item Sales pages stay
-- empty even though orders store correctly.
-- Safe to re-run (add column if not exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- products: columns written by upsertProduct()
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists price_type text,
  add column if not exists unit_name text,
  add column if not exists stock integer;

-- ----------------------------------------------------------------------------
-- order_items: columns written by upsertOrderItemRecord()
-- (clover_merchant_id / clover_order_id let us query items without joining
--  back to orders; unit_name / note / created_time preserve source values.)
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists clover_merchant_id text,
  add column if not exists clover_order_id text,
  add column if not exists unit_name text,
  add column if not exists note text,
  add column if not exists created_time bigint;

create index if not exists idx_order_items_merchant_order
  on public.order_items (clover_merchant_id, clover_order_id);
create index if not exists idx_order_items_item
  on public.order_items (clover_item_id);
