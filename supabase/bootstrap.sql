-- ============================================================================
-- BOOTSTRAP — Run this ONCE in the Supabase SQL Editor.
-- After this one-time paste, the Madd Hatter app automatically runs ALL its
-- own migrations (0001–0011) on first cold start and never re-runs them.
-- You never have to paste migration SQL again.
-- ============================================================================

-- 1. Tracking table: which migrations have already been applied.
create table if not exists public.schema_migrations (
  id          text primary key,
  applied_at  timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;
drop policy if exists deny_anon_schema_migrations on public.schema_migrations;
create policy deny_anon_schema_migrations on public.schema_migrations
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 2. RPC function the app calls to execute a migration's SQL.
--    security definer => runs as the owner (postgres), so it can do DDL
--    (create table / alter table / create index) which the REST API otherwise
--    cannot. Restricted to the service_role so anonymous callers can't use it.
create or replace function public.run_migration_sql(p_sql text)
returns text
language plpgsql
security definer
as $$
begin
  execute p_sql;
  return 'ok';
end;
$$;

revoke execute on function public.run_migration_sql(text) from anon, authenticated;
grant  execute on function public.run_migration_sql(text) to service_role;
