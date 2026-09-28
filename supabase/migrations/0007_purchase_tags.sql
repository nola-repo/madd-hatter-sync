-- Purchase tags tracking table for the "Who bought Wings?" → GHL tag feature.
-- Records which Clover customers have had a "Purchased: <Item>" tag applied
-- to their GHL contact, making the operation idempotent.

create table if not exists public.purchase_tags (
  id uuid primary key default gen_random_uuid(),
  clover_merchant_id text not null,
  clover_customer_id text not null,
  ghl_contact_id text,
  -- Normalized item name (e.g. "Wings") used for dedup + lookup.
  normalized_item_name text not null,
  -- The actual tag label applied in GHL (e.g. "Purchased: Wings").
  tag_label text not null,
  clover_item_id text,
  -- applied | error
  status text not null default 'applied',
  error text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One tag per (customer, normalized item). Re-running sync updates the row.
create unique index if not exists purchase_tags_customer_item_uniq
  on public.purchase_tags (clover_customer_id, normalized_item_name);

create index if not exists purchase_tags_item_idx
  on public.purchase_tags (normalized_item_name);

create index if not exists purchase_tags_customer_idx
  on public.purchase_tags (clover_customer_id);

-- RLS: deny anonymous, allow service role (server-only access).
alter table public.purchase_tags enable row level security;

drop policy if exists deny_anon_purchase_tags on public.purchase_tags;
create policy deny_anon_purchase_tags on public.purchase_tags
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
