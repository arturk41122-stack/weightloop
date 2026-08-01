-- Юзернейм нужен, чтобы приглашать бадди по имени, а не по внутреннему id
alter table profiles add column if not exists telegram_username text unique;

-- Приглашения в бадди. Если получатель ещё не подтвердил — статус pending.
create table if not exists buddy_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references profiles(id) on delete cascade,
  to_username text not null,
  status text check (status in ('pending', 'accepted', 'declined')) not null default 'pending',
  created_at timestamptz not null default now()
);

alter table buddy_invites enable row level security;

-- Отправитель видит свои исходящие приглашения
create policy "invites_select_sent" on buddy_invites for select
  using (auth.uid() = from_user);

-- Получатель видит приглашения, адресованные его текущему юзернейму
create policy "invites_select_received" on buddy_invites for select
  using (
    to_username = (select telegram_username from profiles where id = auth.uid())
  );

create policy "invites_insert_own" on buddy_invites for insert
  with check (auth.uid() = from_user);

-- Обновлять статус (принять/отклонить) может только получатель
create policy "invites_update_received" on buddy_invites for update
  using (
    to_username = (select telegram_username from profiles where id = auth.uid())
  );

-- Storage bucket для фото еды. Публичный на чтение (нужны прямые ссылки на фото в чате бота),
-- запись — только в свою собственную папку /{user_id}/...
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

create policy "meal_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'meal-photos');

create policy "meal_photos_own_write"
  on storage.objects for insert
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meal_photos_own_delete"
  on storage.objects for delete
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
