-- Sprint 2.0: minimal persistent identity backed by Supabase Auth.
create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_nome_check check (char_length(trim(nome)) between 2 and 80)
);

alter table user_profiles enable row level security;
revoke all on user_profiles from anon;
grant select, insert, update, delete on user_profiles to authenticated;

drop policy if exists "users read own profile" on user_profiles;
create policy "users read own profile" on user_profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users insert own profile" on user_profiles;
create policy "users insert own profile" on user_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users update own profile" on user_profiles;
create policy "users update own profile" on user_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users delete own profile" on user_profiles;
create policy "users delete own profile" on user_profiles for delete to authenticated using (auth.uid() = user_id);

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  v_name := trim(coalesce(new.raw_user_meta_data->>'nome', ''));
  if char_length(v_name) < 2 then v_name := 'Usuário'; end if;
  insert into user_profiles(user_id, nome) values (new.id, left(v_name, 80))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_auth_user();

insert into user_profiles(user_id, nome)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'nome'), ''), 'Usuário'), 80)
from auth.users
on conflict (user_id) do nothing;

create or replace function touch_user_profile_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.nome := trim(new.nome);
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists user_profiles_touch_updated_at on user_profiles;
create trigger user_profiles_touch_updated_at before update on user_profiles
for each row execute function touch_user_profile_updated_at();

revoke all on function handle_new_auth_user() from public, anon, authenticated;
revoke all on function touch_user_profile_updated_at() from public, anon, authenticated;
