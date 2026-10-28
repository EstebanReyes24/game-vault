-- =====================================================================
-- Game Vault • Paindex — Migración Fase 0 (seguridad, privacidad y datos)
--
-- CÓMO APLICARLA
--   1. Supabase → SQL Editor → New query.
--   2. Pega TODO este archivo y pulsa Run (corre en una sola transacción:
--      si algo falla, no se aplica nada).
--   3. Se puede volver a ejecutar sin romper nada.
--
-- QUÉ HACE
--   • Tabla `profiles` con nombre de usuario ÚNICO y opción de perfil público.
--   • El estante solo es visible para otros si el dueño lo hace público.
--   • La clave de `games` pasa a ser (user_id, id): los IDs de un usuario ya
--     no pueden chocar con los de otro.
--   • Los comentarios toman el nombre del perfil (nadie puede firmar como otro)
--     y tienen límite de largo y de velocidad (anti-spam).
--   • Estadísticas de comunidad calculadas en el servidor.
--   • Función para que cada usuario borre su cuenta y todos sus datos.
--   • Limpieza: portadas base64, años de "completado" falsos y URLs http.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. PERFILES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

drop policy if exists "Perfiles públicos o propios" on public.profiles;
create policy "Perfiles públicos o propios" on public.profiles
  for select using (is_public or auth.uid() = id);

drop policy if exists "Cada usuario edita su perfil" on public.profiles;
create policy "Cada usuario edita su perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- El usuario solo puede cambiar si su perfil es público, no su username
-- (cambiarlo rompería los enlaces que ya compartió).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (is_public) on public.profiles to authenticated;

-- Convierte cualquier texto en un username válido: minúsculas, a-z 0-9 _, máx. 20
create or replace function public.normalize_username(raw text)
returns text
language sql
immutable
as $$
  select left(regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9_]', '', 'g'), 20)
$$;

-- Devuelve un username libre a partir del deseado (pain → pain_2 si ya existe)
create or replace function public.unique_username(raw text, uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text := public.normalize_username(raw);
  candidate text;
  n int := 1;
begin
  if char_length(base) < 3 then
    base := 'jugador';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate and id <> uid) loop
    n := n + 1;
    candidate := left(base, 20 - char_length(n::text) - 1) || '_' || n;
  end loop;
  return candidate;
end;
$$;

-- ¿Está libre este username? (para validar en el registro)
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(name, '') ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = name)
$$;

revoke all on function public.unique_username(text, uuid) from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    public.unique_username(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)), new.id)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles para las cuentas que ya existían. Quedan PÚBLICOS para no romper
-- los enlaces de estante que ya se compartieron; cada quien puede cambiarlo.
-- Si dos cuentas querían el mismo nombre, se lo queda la más antigua.
do $$
declare
  u record;
begin
  for u in select id, email, raw_user_meta_data from auth.users order by created_at loop
    if not exists (select 1 from public.profiles where id = u.id) then
      insert into public.profiles (id, username, is_public)
      values (
        u.id,
        public.unique_username(coalesce(u.raw_user_meta_data ->> 'username', split_part(u.email, '@', 1)), u.id),
        true
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. JUEGOS
-- ---------------------------------------------------------------------

-- 2.1 Clave primaria compuesta (user_id, id)
do $$
declare
  pk_cols int;
begin
  select array_length(conkey, 1) into pk_cols
  from pg_constraint
  where conrelid = 'public.games'::regclass and contype = 'p';

  if pk_cols = 1 then
    alter table public.games drop constraint games_pkey;
    alter table public.games add constraint games_pkey primary key (user_id, id);
  end if;
end;
$$;

-- 2.2 Limpieza de datos existentes
update public.games set cover_url = null
  where cover_url like 'data:%';                       -- portadas base64 generadas
update public.games set cover_url = regexp_replace(cover_url, '^http://', 'https://')
  where cover_url like 'http://%';
update public.games set completed_year = null
  where status in ('playing', 'onhold');               -- no estaban terminados
alter table public.games alter column rating drop default;  -- sin nota = "sin calificar"

-- 2.3 Reglas de validación (las filas viejas no se revisan: NOT VALID)
alter table public.games drop constraint if exists games_status_valid;
alter table public.games add constraint games_status_valid
  check (status in ('playing', 'completed', 'extras', 'platinum', 'onhold', 'backlog')) not valid;

alter table public.games drop constraint if exists games_title_length;
alter table public.games add constraint games_title_length
  check (char_length(title) between 1 and 150) not valid;

alter table public.games drop constraint if exists games_notes_length;
alter table public.games add constraint games_notes_length
  check (notes is null or char_length(notes) <= 2000) not valid;

alter table public.games drop constraint if exists games_cover_https;
alter table public.games add constraint games_cover_https
  check (cover_url is null or cover_url = '' or cover_url ~ '^https://[^\s"''<>]+$') not valid;

alter table public.games drop constraint if exists games_rating_range;
alter table public.games add constraint games_rating_range
  check (rating is null or rating between 0 and 10) not valid;

alter table public.games drop constraint if exists games_hours_positive;
alter table public.games add constraint games_hours_positive
  check (coalesce(hours, 0) >= 0 and coalesce(target_hours, 0) >= 0) not valid;

-- 2.4 Políticas: se borran TODAS las anteriores de games (sin importar su nombre)
do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'games' loop
    execute format('drop policy %I on public.games', r.policyname);
  end loop;
end;
$$;

create policy "Ver juegos propios o de perfiles públicos" on public.games
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = games.user_id and p.is_public)
  );
create policy "Añadir juegos propios" on public.games
  for insert with check (auth.uid() = user_id);
create policy "Editar juegos propios" on public.games
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Borrar juegos propios" on public.games
  for delete using (auth.uid() = user_id);

create index if not exists games_user_id_idx on public.games (user_id);

-- ---------------------------------------------------------------------
-- 3. COMENTARIOS: nombre real, largo máximo y anti-spam
-- ---------------------------------------------------------------------
alter table public.post_comments drop constraint if exists post_comments_length;
alter table public.post_comments add constraint post_comments_length
  check (char_length(btrim(comment)) between 1 and 1000) not valid;

create or replace function public.before_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
begin
  -- El nombre siempre sale del perfil, no de lo que mande el navegador
  select username into new.username from public.profiles where id = new.user_id;
  if new.username is null then
    raise exception 'Tu cuenta no tiene perfil. Cierra sesión y vuelve a entrar.';
  end if;

  select count(*) into recent
  from public.post_comments
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if recent >= 5 then
    raise exception 'Estás comentando muy rápido. Espera un minuto.';
  end if;

  new.comment := btrim(new.comment);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists comments_before_insert on public.post_comments;
create trigger comments_before_insert
  before insert on public.post_comments
  for each row execute function public.before_comment_insert();

-- Los comentarios viejos muestran el username actual del perfil
update public.post_comments c
set username = p.username
from public.profiles p
where p.id = c.user_id and c.username is distinct from p.username;

-- ---------------------------------------------------------------------
-- 4. ESTADÍSTICAS DE COMUNIDAD (calculadas en el servidor, solo totales)
-- ---------------------------------------------------------------------
create or replace function public.community_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_hours',     coalesce(sum(g.hours), 0),
    'total_games',     count(*),
    'total_platinums', count(*) filter (where g.status = 'platinum'),
    'top_game', (
      select min(btrim(title))
      from public.games
      group by lower(btrim(title))
      order by count(*) desc, sum(coalesce(hours, 0)) desc
      limit 1
    )
  )
  from public.games g
$$;

grant execute on function public.community_stats() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. BORRAR MI CUENTA (borra en cascada juegos, comentarios, likes y perfil)
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
