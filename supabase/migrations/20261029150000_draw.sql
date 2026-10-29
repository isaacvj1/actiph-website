-- Winner draw (Terms clause 8). Run once, after the Closing Date, in the
-- Supabase SQL editor with the independent supervisor watching:
--   select * from promo.draw_winners();
-- It picks 6 winners and 6 reserve winners at random from all entries, one
-- prize per person, and keeps the result in promo.draw_results.

create table promo.draw_results (
  draw_position smallint primary key check (draw_position between 1 and 12),
  -- Cleared if the entry is later deleted (reserves are deleted with the other
  -- entries after the retention period); the code stays as the audit record.
  entry_id uuid unique references promo.entries (id) on delete set null,
  code text not null,
  prize text not null,
  drawn_at timestamptz not null default now()
);
alter table promo.draw_results enable row level security;
revoke all on promo.draw_results from public, anon, authenticated;

create or replace function promo.draw_winners()
returns table (draw_position smallint, prize text, code text, full_name text, email text, phone text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s promo.settings;
  e record;
  v_pos smallint := 0;
  v_drawn bigint[] := '{}';
begin
  select * into s from promo.settings where id;
  if now() < s.closes_at then
    raise exception 'The promotion closes at %. Run the draw after that.', s.closes_at;
  end if;
  lock table promo.draw_results in exclusive mode;
  if exists (select 1 from promo.draw_results) then
    raise exception 'The draw has already been run. The results are in promo.draw_results.';
  end if;

  -- Group entries into people: entries sharing an email or a phone number are
  -- one person, including through a chain (A and B share an email, B and C a
  -- phone). Phones compare by digits, so +356 7912 3456 = 79123456.
  create temp table draw_people on commit drop as
    select id, email,
           regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^(00)?356([0-9]{8})$', '\2') as phone,
           row_number() over () as person
      from promo.entries;
  loop
    update pg_temp.draw_people p set person = m.person
      from (select id, least(min(person) over (partition by email),
                             min(person) over (partition by phone)) as person
              from pg_temp.draw_people) m
     where m.id = p.id and m.person < p.person;
    exit when not found;
  end loop;
  raise notice 'Drawing from % entries by % people.',
    (select count(*) from pg_temp.draw_people), (select count(distinct person) from pg_temp.draw_people);

  -- Every entry has an equal chance (gen_random_uuid uses the server's secure
  -- random source). Clause 8.3: an entry from someone already drawn is set
  -- aside and the next one drawn.
  for e in select en.id, en.code, p.person
             from promo.entries en join pg_temp.draw_people p on p.id = en.id
            order by gen_random_uuid() loop
    continue when e.person = any (v_drawn);

    v_pos := v_pos + 1;
    v_drawn := v_drawn || e.person;
    -- Clause 8.2: prizes go in the order winners are drawn.
    insert into promo.draw_results (draw_position, entry_id, code, prize)
    values (v_pos, e.id, e.code, case
      when v_pos = 1 then 'Apple AirPods 5'
      when v_pos <= 3 then 'HYROX UK ticket'
      when v_pos <= 6 then '3 months’ worth of ActiPH'
      else 'Reserve ' || (v_pos - 6)
    end);
    exit when v_pos = 12;
  end loop;

  -- Winners are kept past the retention period (Privacy Notice clause 17.5).
  update promo.entries set is_winner = true
   where id in (select entry_id from promo.draw_results where draw_position <= 6);

  return query
    select r.draw_position, r.prize, r.code, en.full_name, en.email, en.phone
      from promo.draw_results r
      join promo.entries en on en.id = r.entry_id
     order by r.draw_position;
end;
$$;
revoke all on function promo.draw_winners() from public, anon, authenticated;
