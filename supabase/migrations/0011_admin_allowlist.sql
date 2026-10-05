-- Allowlist of approved admin users. A newly registered user is NOT an admin
-- until their row is inserted here (or their email is added). This keeps open
-- public sign-up from automatically granting access to POS/CRM data.
create table if not exists public.admin_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  approved  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helpful: look up approved admins by email too.
create index if not exists admin_users_email_idx on public.admin_users(email);

-- Optional convenience: a view of approved admin emails for quick dashboard checks.
create or replace view public.approved_admin_emails as
  select email from public.admin_users where approved = true;
