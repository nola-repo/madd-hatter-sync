-- ============================================================================
-- 0003_auto_sync.sql
-- Adds CRM auto-sync tracking columns to sync_runs.
-- Run after 0002_pos_tables.sql. Safe to re-run.
-- ============================================================================

alter table public.sync_runs
  add column if not exists crm_orders_synced integer not null default 0,
  add column if not exists crm_orders_held integer not null default 0,
  add column if not exists crm_orders_errors integer not null default 0,
  add column if not exists crm_contacts_created integer not null default 0,
  add column if not exists crm_purchase_records_created integer not null default 0;
