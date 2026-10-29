-- =====================================================================
-- Paindex Vault — Migración 012: juegos vinculados a Steam/Xbox y logros
--
-- - Cada juego puede guardar su ID de Steam o de Xbox, cuándo se jugó por
--   primera y última vez, cuántos logros tiene y datos de RAWG.
-- - Cada usuario puede guardar (en privado) su cuenta de Steam y su gamertag
--   para el botón "Actualizar desde Steam/Xbox".
-- - Los logros de cada juego se guardan para no pedirlos cada vez.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

-- 1. Datos nuevos por juego
alter table public.games add column if not exists steam_appid   integer;
alter table public.games add column if not exists xbox_title_id text;
alter table public.games add column if not exists first_played  timestamptz;
alter table public.games add column if not exists last_played   timestamptz;
alter table public.games add column if not exists ach_unlocked  integer;
alter table public.games add column if not exists ach_total     integer;
alter table public.games add column if not exists release_year  integer;
alter table public.games add column if not exists developer     text;

alter table public.games drop constraint if exists games_xbox_title_id_formato;
alter table public.games add constraint games_xbox_title_id_formato
  check (xbox_title_id is null or xbox_title_id ~ '^[0-9]{1,12}$') not valid;
alter table public.games drop constraint if exists games_developer_largo;
alter table public.games add constraint games_developer_largo
  check (developer is null or char_length(developer) <= 120) not valid;

-- 2. Cuentas vinculadas (privado: solo su dueño)
create table if not exists public.platform_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  steam_id      text check (steam_id is null or steam_id ~ '^[0-9]{17}$'),
  xbox_gamertag text check (xbox_gamertag is null or char_length(xbox_gamertag) <= 20),
  xbox_xuid     text check (xbox_xuid is null or xbox_xuid ~ '^[0-9]{1,20}$'),
  updated_at    timestamptz not null default now()
);
alter table public.platform_links enable row level security;
drop policy if exists "Cada uno gestiona sus cuentas vinculadas" on public.platform_links;
create policy "Cada uno gestiona sus cuentas vinculadas" on public.platform_links for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Logros guardados por juego (se ven igual que el estante)
create table if not exists public.game_achievements (
  user_id   uuid not null,
  game_id   bigint not null,
  source    text not null check (source in ('steam', 'xbox')),
  items     jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (user_id, game_id),
  foreign key (user_id, game_id) references public.games (user_id, id) on delete cascade
);
alter table public.game_achievements enable row level security;
drop policy if exists "Ver logros" on public.game_achievements;
create policy "Ver logros" on public.game_achievements for select using (
  auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
);
drop policy if exists "Gestionar mis logros" on public.game_achievements;
create policy "Gestionar mis logros" on public.game_achievements for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Tamaño razonable: hasta 1500 logros por juego
alter table public.game_achievements drop constraint if exists game_achievements_tamano;
alter table public.game_achievements add constraint game_achievements_tamano
  check (jsonb_array_length(items) <= 1500);

commit;
