-- ActiPH × HYROX UK promotion: codes, entries and attempt log.
--
-- Security model (see SECURITY.md):
--   * All data lives in the private "promo" schema, which the public API does
--     not expose and which anon/authenticated roles cannot use at all.
--   * Row Level Security is on for every table with no policies, so even a
--     mistaken grant would return no rows.
--   * The only way in from outside is public.submit_entry(), which only the
--     service_role (used by the submit-entry Edge Function, server side) may run.
--   * Staff read entries through the Supabase dashboard (2FA), never the API.

create schema if not exists promo;
revoke all on schema promo from public, anon, authenticated;

-- One-row settings table: the promotion window and anti-guessing limits.
create table promo.settings (
  id boolean primary key default true check (id),
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  max_failed_per_15min integer not null default 5,
  max_attempts_per_day integer not null default 40,
  -- Site-wide brake on code guessing, since IP addresses can be faked.
  max_failed_global_per_10min integer not null default 300,
  entry_retention interval not null default interval '6 months',
  attempt_retention interval not null default interval '30 days'
);
-- Malta time (CET, UTC+1): entries 1 Dec 2026 00:00 to 31 Jan 2027 23:59:59.
insert into promo.settings (opens_at, closes_at)
values ('2026-12-01 00:00:00+01', '2027-02-01 00:00:00+01');

-- Codes printed on the WIN stickers. Import with:
--   \copy promo.codes (code) from 'codes.csv' with (format csv)
create table promo.codes (
  code text primary key check (code ~ '^[A-Z0-9-]{4,16}$'),
  used_at timestamptz,
  entry_id uuid
);

create table promo.entries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique references promo.codes (code),
  full_name text not null check (char_length(full_name) between 2 and 100),
  email text not null check (char_length(email) between 5 and 150 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text not null check (char_length(phone) between 8 and 20 and phone ~ '^[+0-9 ()-]+$'),
  sport text not null check (char_length(sport) between 1 and 60),
  sport_other text check (sport_other is null or char_length(sport_other) between 2 and 60),
  is_winner boolean not null default false,
  created_at timestamptz not null default now()
);

alter table promo.codes
  add constraint codes_entry_fk foreign key (entry_id) references promo.entries (id) on delete set null;

-- Every submission attempt, keyed by a keyed hash of the IP address (the raw
-- IP is never stored). Used for rate limiting, then purged.
create table promo.attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index attempts_ip_time on promo.attempts (ip_hash, created_at);
create index attempts_failed_time on promo.attempts (created_at) where not ok;

alter table promo.settings enable row level security;
alter table promo.codes enable row level security;
alter table promo.entries enable row level security;
alter table promo.attempts enable row level security;
revoke all on all tables in schema promo from public, anon, authenticated;
revoke all on all sequences in schema promo from public, anon, authenticated;

-- The single entry point. Returns one of: ok, invalid_input, invalid_code,
-- code_used, rate_limited, not_open, closed.
create or replace function public.submit_entry(
  p_code text,
  p_name text,
  p_email text,
  p_phone text,
  p_sport text,
  p_sport_other text,
  p_ip_hash text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s promo.settings;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[[:space:]]', '', 'g'));
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_sport text := btrim(coalesce(p_sport, ''));
  v_sport_other text := nullif(btrim(coalesce(p_sport_other, '')), '');
  v_failed integer;
  v_total integer;
  v_entry uuid;
begin
  select * into s from promo.settings where id;
  if now() < s.opens_at then return 'not_open'; end if;
  if now() >= s.closes_at then return 'closed'; end if;

  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then return 'invalid_input'; end if;

  -- One submission at a time per device, so the limits below can't be raced.
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  select count(*) filter (where not ok and created_at > now() - interval '15 minutes'),
         count(*)
    into v_failed, v_total
    from promo.attempts
   where ip_hash = p_ip_hash and created_at > now() - interval '1 day';
  if v_failed >= s.max_failed_per_15min or v_total >= s.max_attempts_per_day then
    return 'rate_limited';
  end if;
  if (select count(*) from promo.attempts
       where not ok and created_at > now() - interval '10 minutes') >= s.max_failed_global_per_10min then
    return 'rate_limited';
  end if;

  if v_code !~ '^[A-Z0-9-]{4,16}$'
     or char_length(v_name) not between 2 and 100
     or char_length(v_email) not between 5 and 150
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_phone) not between 8 and 20
     or v_phone !~ '^[+0-9 ()-]+$'
     or char_length(v_sport) not between 1 and 60
     or (v_sport = 'Other') <> (v_sport_other is not null)
     or char_length(coalesce(v_sport_other, 'xx')) not between 2 and 60 then
    insert into promo.attempts (ip_hash, ok) values (p_ip_hash, false);
    return 'invalid_input';
  end if;

  -- Claim the code. The row lock makes this exactly-once even under load.
  update promo.codes set used_at = now()
   where code = v_code and used_at is null;
  if not found then
    insert into promo.attempts (ip_hash, ok) values (p_ip_hash, false);
    if exists (select 1 from promo.codes where code = v_code) then
      return 'code_used';
    end if;
    return 'invalid_code';
  end if;

  insert into promo.entries (code, full_name, email, phone, sport, sport_other)
  values (v_code, v_name, v_email, v_phone, v_sport, v_sport_other)
  returning id into v_entry;
  update promo.codes set entry_id = v_entry where code = v_code;
  insert into promo.attempts (ip_hash, ok) values (p_ip_hash, true);
  return 'ok';
end;
$$;

revoke all on function public.submit_entry(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_entry(text, text, text, text, text, text, text) to service_role;

-- Data retention (Privacy Notice clause 17.5): delete non-winning entries once
-- the retention period after closing has passed, and old attempt records.
create or replace function promo.purge_expired()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from promo.entries e
   using promo.settings s
   where s.id and not e.is_winner and now() > s.closes_at + s.entry_retention;
  delete from promo.attempts a
   using promo.settings s
   where s.id and a.created_at < now() - s.attempt_retention;
$$;
revoke all on function promo.purge_expired() from public, anon, authenticated;

-- Run the purge daily at 03:15 UTC.
create extension if not exists pg_cron;
select cron.schedule('promo-purge-expired', '15 3 * * *', 'select promo.purge_expired()');
