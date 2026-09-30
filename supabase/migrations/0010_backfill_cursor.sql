-- 0010_backfill_cursor.sql
-- Adds the paused_at_cursor column to sync_runs so the customer-first
-- backfill pipeline (backfillStrandedCustomers) can save its exact position
-- when it hits the ~22s time-box, then resume cleanly on the next cron tick.
-- Idempotent: safe to run multiple times.

alter table public.sync_runs
  add column if not exists paused_at_cursor text;

-- Index for fast lookup of the most recent backfill cursor.
create index if not exists idx_sync_runs_backfill_cursor
  on public.sync_runs (kind, started_at desc)
  where kind = 'customer-backfill';
