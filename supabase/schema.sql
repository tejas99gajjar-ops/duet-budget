-- Duet Budget · Supabase schema. Paste into Supabase → SQL Editor → Run. Safe to re-run on an empty project.
-- Security model: every table has Row Level Security; a user can only see rows of the one "space" (shared account) they belong to.

-- ---------- tables ----------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  tz text not null default 'UTC',
  week_start smallint not null default 0 check (week_start between 0 and 6),   -- 0 = Monday … 6 = Sunday
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  max_members int not null default 6,
  created_at timestamptz not null default now()
);
create table public.members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text,
  color text not null default '#1DDB97' check (color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create table public.wallets (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  type text not null check (type in ('bank','cash','savings','shared')),
  color text not null default '#1DDB97',
  initial_cents bigint not null default 0,
  archived boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, space_id)
);
create table public.categories (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  icon text not null default '🏷️',
  kind text not null check (kind in ('expense','income')),
  color text not null default '#8B97B3',
  archived boolean not null default false,
  unique (id, space_id)
);
create table public.recurring (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  type text not null check (type in ('expense','income','transfer')),
  amount_cents bigint not null check (amount_cents > 0),
  wallet_id bigint not null, to_wallet_id bigint, category_id bigint,
  note text not null default '', tags text[] not null default '{}',
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  next_date date not null, time time not null default '12:00',
  active boolean not null default true,
  created_by uuid default auth.uid(),
  foreign key (wallet_id, space_id) references public.wallets(id, space_id) on delete cascade,
  foreign key (to_wallet_id, space_id) references public.wallets(id, space_id) on delete cascade,
  foreign key (category_id, space_id) references public.categories(id, space_id) on delete set null (category_id)
);
create table public.transactions (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  type text not null check (type in ('expense','income','transfer')),
  amount_cents bigint not null check (amount_cents > 0),
  wallet_id bigint not null, to_wallet_id bigint, category_id bigint,
  note text not null default '' check (char_length(note) <= 500),
  tags text[] not null default '{}',
  date date not null, time time not null default '12:00',
  status text not null default 'cleared' check (status in ('cleared','pending')),
  created_by uuid default auth.uid(),
  recurring_id bigint references public.recurring(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (type <> 'transfer' or (to_wallet_id is not null and to_wallet_id <> wallet_id)),
  -- composite keys guarantee a transaction can only point at wallets/categories of its own space
  foreign key (wallet_id, space_id) references public.wallets(id, space_id),
  foreign key (to_wallet_id, space_id) references public.wallets(id, space_id),
  foreign key (category_id, space_id) references public.categories(id, space_id) on delete set null (category_id)
);
create index tx_space_date on public.transactions (space_id, date desc, time desc);
create table public.budgets (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  category_id bigint not null,
  amount_cents bigint not null check (amount_cents > 0),
  period text not null default 'monthly' check (period in ('monthly','weekly','daily')),
  rollover boolean not null default false,
  start_date date not null default date_trunc('month', now())::date,
  created_by uuid default auth.uid(),
  unique (space_id, category_id),
  foreign key (category_id, space_id) references public.categories(id, space_id) on delete cascade
);
create table public.investments (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 12), name text not null default '',
  kind text not null check (kind in ('stock','crypto','etf','bond','other')),
  quantity numeric not null check (quantity > 0),
  cost_cents bigint not null default 0, price_cents bigint not null check (price_cents > 0), prev_price_cents bigint not null,
  price_updated_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table public.activity (
  id bigint generated always as identity primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid, text text not null, ts timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function public.my_space() returns uuid
language sql stable security definer set search_path = public as
$$ select space_id from public.members where user_id = auth.uid() $$;

create or replace function public.seed_categories(p_space uuid) returns void
language sql security definer set search_path = public as
$$ insert into public.categories(space_id, name, icon, kind, color) values
  (p_space,'Food & Drinks','🍔','expense','#F5A623'),(p_space,'Groceries','🛒','expense','#1DDB97'),(p_space,'Transport','🚇','expense','#3B82F6'),
  (p_space,'Bills & Utilities','⚡','expense','#7C5FE6'),(p_space,'Entertainment','🎬','expense','#E879A0'),(p_space,'Travel','✈️','expense','#38BDF8'),
  (p_space,'Health','🏥','expense','#F04444'),(p_space,'Shopping','🛍️','expense','#F472B6'),(p_space,'Home','🏠','expense','#A3E635'),(p_space,'Other','📦','expense','#8B97B3'),
  (p_space,'Salary','💼','income','#1DDB97'),(p_space,'Freelance','💻','income','#3B82F6'),(p_space,'Gift','🎁','income','#E879A0'),(p_space,'Interest','🏦','income','#F5A623'),(p_space,'Other income','💰','income','#8B97B3') $$;

-- ---------- RPCs (the only way to create/join/leave a space) ----------
create or replace function public.create_space(p_name text, p_user_name text, p_tz text default 'UTC') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; em text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'You already belong to a shared account'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into spaces(name, tz, owner_id) values (left(coalesce(nullif(trim(p_name), ''), 'Shared budget'), 60), coalesce(nullif(p_tz, ''), 'UTC'), auth.uid()) returning id into sid;
  insert into members(space_id, user_id, name, email) values (sid, auth.uid(), left(p_user_name, 60), em);
  perform seed_categories(sid);
  insert into activity(space_id, user_id, text) values (sid, auth.uid(), p_user_name || ' joined');
  return sid;
end $$;

create or replace function public.join_space(p_code text, p_user_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sp spaces; cur uuid; em text; n int; colors text[] := array['#1DDB97','#7C5FE6','#F5A623','#3B82F6','#E879A0','#F04444'];
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into sp from spaces where invite_code = upper(trim(p_code));
  if sp.id is null then raise exception 'That invite code was not found'; end if;
  select space_id into cur from members where user_id = auth.uid();
  if cur = sp.id then return sp.id; end if;
  if cur is not null then
    -- only an empty, single-person account can be abandoned for another
    if (select count(*) from members where space_id = cur) > 1 then raise exception 'Leave your shared account first'; end if;
    if exists (select 1 from transactions where space_id = cur) or exists (select 1 from wallets where space_id = cur) then raise exception 'Your current account already has data'; end if;
    delete from spaces where id = cur;
  end if;
  select count(*) into n from members where space_id = sp.id;
  if n >= sp.max_members then raise exception 'That shared account is already full'; end if;
  select email into em from auth.users where id = auth.uid();
  insert into members(space_id, user_id, name, email, color) values (sp.id, auth.uid(), left(p_user_name, 60), em, colors[(n % 6) + 1]);
  insert into activity(space_id, user_id, text) values (sp.id, auth.uid(), p_user_name || ' joined');
  return sp.id;
end $$;

create or replace function public.regenerate_invite() returns text
language plpgsql security definer set search_path = public as $$
declare code text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
begin update spaces set invite_code = code where id = my_space(); return code; end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sp spaces;
begin
  select * into sp from spaces where id = my_space();
  if sp.owner_id is distinct from auth.uid() then raise exception 'Only the account owner can do that'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself'; end if;
  delete from members where user_id = p_user and space_id = sp.id;
  insert into activity(space_id, user_id, text) values (sp.id, auth.uid(), 'A person was removed');
end $$;

create or replace function public.wipe_data() returns void
language plpgsql security definer set search_path = public as $$
declare sp spaces;
begin
  select * into sp from spaces where id = my_space();
  if sp.owner_id is distinct from auth.uid() then raise exception 'Only the account owner can do that'; end if;
  delete from transactions where space_id = sp.id; delete from recurring where space_id = sp.id; delete from budgets where space_id = sp.id;
  delete from investments where space_id = sp.id; delete from activity where space_id = sp.id; delete from wallets where space_id = sp.id;
  insert into activity(space_id, user_id, text) values (sp.id, auth.uid(), 'All data was deleted');
end $$;

-- Creates the transactions for every recurring rule that has come due (called by the app when it opens).
create or replace function public.run_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare sp spaces; r recurring; d date; today date; n int := 0; k int;
begin
  select * into sp from spaces where id = my_space();
  if sp.id is null then return 0; end if;
  today := (now() at time zone sp.tz)::date;
  for r in select * from recurring where space_id = sp.id and active and next_date <= today for update loop
    d := r.next_date; k := 0;
    while d <= today and k < 400 loop
      insert into transactions(space_id, type, amount_cents, wallet_id, to_wallet_id, category_id, note, tags, date, time, created_by, recurring_id)
        values (sp.id, r.type, r.amount_cents, r.wallet_id, r.to_wallet_id, r.category_id, r.note, r.tags, d, r.time, r.created_by, r.id);
      n := n + 1; k := k + 1;
      d := case r.frequency when 'daily' then d + 1 when 'weekly' then d + 7
             when 'yearly' then (r.next_date + make_interval(years => k))::date else (r.next_date + make_interval(months => k))::date end;
    end loop;
    update recurring set next_date = d where id = r.id;
  end loop;
  return n;
end $$;

-- Activity log written by the database itself, so it can't be skipped or forged by a client.
create or replace function public.log_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; t public.transactions;
begin
  t := case when tg_op = 'DELETE' then old else new end;
  select name into who from members where user_id = auth.uid();
  insert into activity(space_id, user_id, text) values (t.space_id, auth.uid(),
    coalesce(who, 'Someone') || case tg_op when 'INSERT' then ' added ' when 'UPDATE' then ' edited ' else ' deleted ' end || t.type || ' ' || to_char(t.amount_cents / 100.0, 'FM999,999,999,990.00')
    || case when t.note <> '' then ' · ' || t.note else '' end);
  return t;
end $$;
create trigger tx_activity after insert or update or delete on public.transactions for each row execute function public.log_transaction();

-- ---------- Row Level Security ----------
alter table public.spaces enable row level security;       alter table public.members enable row level security;
alter table public.wallets enable row level security;      alter table public.categories enable row level security;
alter table public.transactions enable row level security; alter table public.budgets enable row level security;
alter table public.recurring enable row level security;    alter table public.investments enable row level security;
alter table public.activity enable row level security;

create policy spaces_read   on public.spaces  for select to authenticated using (id = (select public.my_space()));
create policy spaces_update on public.spaces  for update to authenticated using (id = (select public.my_space())) with check (id = (select public.my_space()));
create policy members_read  on public.members for select to authenticated using (space_id = (select public.my_space()));
create policy members_self  on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and space_id = (select public.my_space()));

do $$ declare t text; begin
  foreach t in array array['wallets','categories','transactions','budgets','recurring','investments'] loop
    execute format('create policy %I_all on public.%I for all to authenticated using (space_id = (select public.my_space())) with check (space_id = (select public.my_space()))', t, t);
  end loop;
end $$;
create policy activity_read on public.activity for select to authenticated using (space_id = (select public.my_space()));

-- Column-level limits: members may rename/recolour only themselves; spaces: only these fields are editable.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.spaces, public.members, public.activity to authenticated;
grant update (name, currency, tz, week_start) on public.spaces to authenticated;
grant update (name, color) on public.members to authenticated;
grant select, insert, update, delete on public.wallets, public.categories, public.transactions, public.budgets, public.recurring, public.investments to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_space(), public.create_space(text, text, text), public.join_space(text, text), public.regenerate_invite(),
  public.remove_member(uuid), public.wipe_data(), public.run_recurring() to authenticated;

-- ---------- realtime: push changes to every signed-in device of the same space ----------
alter publication supabase_realtime add table public.spaces, public.members, public.wallets, public.categories, public.transactions, public.budgets, public.recurring, public.investments, public.activity;
