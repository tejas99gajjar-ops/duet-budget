-- Recurring rules you can edit, including a custom period ("every 2 weeks", "every 3 months").
-- Run once in the Supabase SQL Editor. Safe to run again. Nothing is deleted or rewritten:
--  * adds one column, `every`, to recurring rules (default 1, so every existing rule repeats exactly as it does today)
--  * replaces the function that creates due entries so it steps by `every`
alter table public.recurring add column if not exists every smallint not null default 1;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_every_check') then
    alter table public.recurring add constraint recurring_every_check check (every between 1 and 365);
  end if;
end $$;

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
      d := case r.frequency when 'daily' then (r.next_date + (k * r.every))
             when 'weekly' then (r.next_date + (7 * k * r.every))
             when 'yearly' then (r.next_date + make_interval(years => k * r.every))::date
             else (r.next_date + make_interval(months => k * r.every))::date end;
    end loop;
    update recurring set next_date = d where id = r.id;
  end loop;
  return n;
end $$;
