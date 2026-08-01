-- Профили пользователей (id = auth.users.id)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_id text unique,
  full_name text not null default '',
  target_weight numeric,
  current_weight numeric,
  goal text check (goal in ('lose', 'maintain')) default 'lose',
  food_restrictions text default '',
  reminder_time text default '09:00',
  created_at timestamptz not null default now()
);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date timestamptz not null default now(),
  photo_url text,
  calories numeric,
  proteins numeric,
  carbs numeric,
  fats numeric,
  notes text,
  ai_feedback text
);

create table if not exists sprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  days int not null,
  target_lost numeric not null,
  start_date timestamptz not null default now(),
  end_date timestamptz,
  status text check (status in ('active', 'completed')) default 'active'
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date timestamptz not null default now(),
  meal text,
  steps int,
  weight_change numeric,
  notes text
);

create table if not exists buddies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  buddy_id text not null,
  status text check (status in ('active')) default 'active'
);

-- Row Level Security: каждый видит и пишет только свои данные
alter table profiles enable row level security;
alter table meals enable row level security;
alter table sprints enable row level security;
alter table checkins enable row level security;
alter table buddies enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

create policy "meals_all_own" on meals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sprints_all_own" on sprints for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "checkins_all_own" on checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "buddies_all_own" on buddies for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
