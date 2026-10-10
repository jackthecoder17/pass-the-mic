-- Pass The Mic: accounts, profiles, profile photos, game history and leaderboards.
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text not null default 'Singer' check (char_length(display_name) between 1 and 24),
  avatar_url text,
  face text not null default '😎',
  color smallint not null default 1 check (color between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- every new account gets a profile (name + photo from Google when available)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Singer'), 24),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- game history ----------
create table if not exists public.game_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('local', 'online')),
  pack text check (char_length(pack) <= 60),
  points int not null check (points between 0 and 5000),
  lines int not null default 0 check (lines between 0 and 200),
  players int not null default 1 check (players between 1 and 50),
  won boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists game_results_created_idx on public.game_results (created_at desc);
create index if not exists game_results_user_idx on public.game_results (user_id);
alter table public.game_results enable row level security;
drop policy if exists "results are public" on public.game_results;
create policy "results are public" on public.game_results for select using (true);
drop policy if exists "record own results" on public.game_results;
create policy "record own results" on public.game_results for insert with check (auth.uid() = user_id);

-- ---------- leaderboards ----------
create or replace view public.leaderboard_all with (security_invoker = true) as
  select p.id, p.display_name, p.username, p.avatar_url, p.face, p.color,
         sum(r.points)::int as points, sum(r.lines)::int as lines,
         (count(*) filter (where r.won))::int as wins, count(*)::int as games
  from public.game_results r join public.profiles p on p.id = r.user_id
  group by p.id;

create or replace view public.leaderboard_week with (security_invoker = true) as
  select p.id, p.display_name, p.username, p.avatar_url, p.face, p.color,
         sum(r.points)::int as points, sum(r.lines)::int as lines,
         (count(*) filter (where r.won))::int as wins, count(*)::int as games
  from public.game_results r join public.profiles p on p.id = r.user_id
  where r.created_at > now() - interval '7 days'
  group by p.id;

grant select on public.leaderboard_all, public.leaderboard_week to anon, authenticated;

-- ---------- profile photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "update own avatar" on storage.objects;
create policy "update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
