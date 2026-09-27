-- LabLink schema
-- Run this in the Supabase SQL editor (or apply as a migration).

create table if not exists public.instruments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  model       text,
  location    text,
  status      text not null default 'offline' check (status in ('online', 'offline', 'busy', 'maintenance')),
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.experiments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  instrument_id  uuid not null references public.instruments(id) on delete cascade,
  title          text not null,
  setpoint       numeric,
  duration_sec   integer,
  result         text,
  created_at     timestamptz not null default now()
);

create table if not exists public.command_log (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  instrument_id  uuid not null references public.instruments(id) on delete cascade,
  command        text not null,
  value          text,
  sent_at        timestamptz not null default now()
);

create index if not exists instruments_user_idx on public.instruments(user_id);
create index if not exists experiments_instrument_idx on public.experiments(instrument_id);
create index if not exists command_log_instrument_idx on public.command_log(instrument_id, sent_at desc);

-- Row Level Security: every user only sees and edits their own rows.
alter table public.instruments enable row level security;
alter table public.experiments enable row level security;
alter table public.command_log enable row level security;

create policy "instruments: owner full access" on public.instruments
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "experiments: owner full access" on public.experiments
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "command_log: owner full access" on public.command_log
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
