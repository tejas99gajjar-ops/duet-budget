-- Duet Budget · FIRE planner tables.
-- ADDITIVE ONLY: this file creates two NEW tables and their security rules. It never alters, drops or reads any existing table,
-- so your wallets, transactions, budgets and accounts are untouched. Safe to run more than once.
-- Run it in Supabase → SQL Editor → paste → Run (after supabase/schema.sql, which must already be applied).

create table if not exists public.fire_plans (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null unique references public.spaces(id) on delete cascade,   -- one plan per shared account
  name text not null default 'FIRE Plan' check (char_length(name) between 1 and 80),
  profile jsonb not null default '{}'::jsonb,
  incomes jsonb not null default '[]'::jsonb,
  spending jsonb not null default '{}'::jsonb,
  holdings jsonb not null default '[]'::jsonb,
  loans jsonb not null default '[]'::jsonb,
  insurance jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  scenarios jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  mc_last jsonb,                                         -- the last Monte Carlo result, so it opens instantly
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.fire_snapshots (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  plan_id uuid references public.fire_plans(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  note text not null default '',
  taken_at timestamptz not null default now(),
  plan jsonb not null,                                   -- the full plan as it was
  summary jsonb not null default '{}'::jsonb,            -- net worth, funded %, gap, status at that time
  created_by uuid default auth.uid()
);
create index if not exists fire_snapshots_space on public.fire_snapshots (space_id, taken_at desc);

create or replace function public.fire_touch() returns trigger language plpgsql as
$$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists fire_plans_touch on public.fire_plans;
create trigger fire_plans_touch before update on public.fire_plans for each row execute function public.fire_touch();

alter table public.fire_plans enable row level security;
alter table public.fire_snapshots enable row level security;
drop policy if exists fire_plans_all on public.fire_plans;
create policy fire_plans_all on public.fire_plans for all to authenticated
  using (space_id = (select public.my_space())) with check (space_id = (select public.my_space()));
drop policy if exists fire_snapshots_all on public.fire_snapshots;
create policy fire_snapshots_all on public.fire_snapshots for all to authenticated
  using (space_id = (select public.my_space())) with check (space_id = (select public.my_space()));

revoke all on public.fire_plans, public.fire_snapshots from anon, authenticated;
grant select, insert, update, delete on public.fire_plans, public.fire_snapshots to authenticated;

-- live sync between your devices (ignored if already added)
do $$ begin
  begin alter publication supabase_realtime add table public.fire_plans; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fire_snapshots; exception when duplicate_object then null; end;
end $$;
