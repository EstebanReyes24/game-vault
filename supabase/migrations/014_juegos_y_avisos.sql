-- =====================================================================
-- Paindex Vault — Migración 014: páginas de juego y avisos
--
-- - clave_juego(): la misma "clave" para un juego aunque cambien tildes,
--   mayúsculas o símbolos (™ ®). Es lo que va en /j/<juego>.
-- - juego_comunidad(): todo lo que la comunidad sabe de un juego (solo de
--   estantes públicos y reseñas visibles), para su página.
-- - game_videos: el video de YouTube de Paindex sobre cada juego (lo pone el admin).
-- - notifications: avisos de "te empezó a seguir" y "comentó tu artículo".
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

-- 1. Clave de un juego
create or replace function public.clave_juego(t text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
    translate(lower(coalesce(t, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', '', 'g'
  );
$$;

create index if not exists games_clave_idx on public.games (public.clave_juego(title));
create index if not exists reviews_clave_idx on public.reviews (public.clave_juego(game_title));

-- 2. Video de Paindex por juego
create table if not exists public.game_videos (
  clave      text primary key check (clave ~ '^[a-z0-9]{1,200}$'),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  titulo     text check (titulo is null or char_length(titulo) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.game_videos enable row level security;
drop policy if exists "Videos públicos" on public.game_videos;
create policy "Videos públicos" on public.game_videos for select using (true);
drop policy if exists "Solo admin gestiona videos" on public.game_videos;
create policy "Solo admin gestiona videos" on public.game_videos for all
  using (public.es_admin()) with check (public.es_admin());

-- 3. Página de un juego
create or replace function public.juego_comunidad(p_clave text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with g as (
    select g.title, g.cover_url, g.status, g.rating, g.hours, g.release_year, g.developer, p.username
    from public.games g
    join public.profiles p on p.id = g.user_id and p.is_public
    where public.clave_juego(g.title) = p_clave
  ),
  r as (
    select r.id, p.username, r.rating, left(r.body, 700) as body, r.spoilers, r.created_at, r.featured
    from public.reviews r
    join public.profiles p on p.id = r.user_id and p.is_public
    where not r.hidden and public.clave_juego(r.game_title) = p_clave
    order by r.featured desc, r.created_at desc
    limit 20
  ),
  n as (
    select id, title, category, cover_url, created_at
    from public.posts
    where char_length(p_clave) >= 4
      and (public.clave_juego(game_tag) = p_clave or public.clave_juego(title) like '%' || p_clave || '%')
    order by created_at desc
    limit 6
  )
  select json_build_object(
    'clave', p_clave,
    'titulo', (select title from g group by title order by count(*) desc, length(title) limit 1),
    'portada', (select cover_url from g where cover_url ~ '^https://' group by cover_url order by count(*) desc limit 1),
    'anio', (select max(release_year) from g),
    'desarrollador', (select developer from g where developer is not null group by developer order by count(*) desc limit 1),
    'jugadores', (select count(*) from g),
    'platinos', (select count(*) from g where status = 'platinum'),
    'terminados', (select count(*) from g where status in ('completed', 'extras', 'platinum')),
    'jugando', (select count(*) from g where status = 'playing'),
    'nota_media', (select round(avg(rating)::numeric, 1) from g where rating > 0),
    'notas', (select count(*) from g where rating > 0),
    'horas_media', (select round(avg(hours)) from g where hours > 0),
    'estantes', coalesce((select json_agg(x) from (
        select username, status, rating, hours from g
        order by rating desc nulls last, hours desc nulls last limit 24) x), '[]'::json),
    'resenas', coalesce((select json_agg(r) from r), '[]'::json),
    'noticias', coalesce((select json_agg(n) from n), '[]'::json),
    'video', (select json_build_object('youtube_id', youtube_id, 'titulo', titulo) from public.game_videos where clave = p_clave)
  );
$$;
grant execute on function public.juego_comunidad(text) to anon, authenticated;
grant execute on function public.clave_juego(text) to anon, authenticated;

-- Juegos más registrados (para enlazar a sus páginas)
create or replace function public.juegos_populares(p_limite int default 24)
returns table (clave text, titulo text, portada text, jugadores bigint, nota_media numeric)
language sql
stable
security definer
set search_path = public
as $$
  select public.clave_juego(g.title),
         (array_agg(g.title order by g.title))[1],
         (array_agg(g.cover_url) filter (where g.cover_url ~ '^https://'))[1],
         count(*),
         round(avg(g.rating) filter (where g.rating > 0)::numeric, 1)
  from public.games g
  join public.profiles p on p.id = g.user_id and p.is_public
  group by 1
  order by 4 desc, 5 desc nulls last
  limit least(greatest(coalesce(p_limite, 24), 1), 60);
$$;
grant execute on function public.juegos_populares(int) to anon, authenticated;

-- 4. Avisos
create table if not exists public.notifications (
  id         bigint generated by default as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('seguidor', 'comentario')),
  actor      text,
  texto      text check (texto is null or char_length(texto) <= 300),
  enlace     text check (enlace is null or enlace ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Ver mis avisos" on public.notifications;
create policy "Ver mis avisos" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Marcar mis avisos" on public.notifications;
create policy "Marcar mis avisos" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Borrar mis avisos" on public.notifications;
create policy "Borrar mis avisos" on public.notifications for delete using (auth.uid() = user_id);
-- (se crean solo desde los disparadores de abajo)

create or replace function public.avisar_seguidor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare quien text;
begin
  select username into quien from public.profiles where id = new.follower_id;
  if quien is null then return new; end if;
  -- no repetir si ya hubo aviso de esta persona en el último día (seguir y dejar de seguir)
  if exists (select 1 from public.notifications where user_id = new.followed_id and kind = 'seguidor'
             and actor = quien and created_at > now() - interval '1 day') then
    return new;
  end if;
  insert into public.notifications (user_id, kind, actor, texto, enlace)
  values (new.followed_id, 'seguidor', quien, 'empezó a seguir tu estante', '/u/' || quien);
  return new;
end;
$$;
drop trigger if exists avisar_seguidor on public.follows;
create trigger avisar_seguidor after insert on public.follows
  for each row execute function public.avisar_seguidor();

create or replace function public.avisar_comentario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare autor uuid; titulo text;
begin
  select user_id, title into autor, titulo from public.posts where id = new.post_id;
  if autor is null or autor = new.user_id then return new; end if;
  insert into public.notifications (user_id, kind, actor, texto, enlace)
  values (autor, 'comentario', new.username, 'comentó «' || left(titulo, 120) || '»', '/a/' || new.post_id);
  return new;
end;
$$;
drop trigger if exists avisar_comentario on public.post_comments;
create trigger avisar_comentario after insert on public.post_comments
  for each row execute function public.avisar_comentario();

-- Los avisos de más de 60 días se borran solos al crear uno nuevo
create or replace function public.limpiar_avisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where user_id = new.user_id and created_at < now() - interval '60 days';
  return new;
end;
$$;
drop trigger if exists limpiar_avisos on public.notifications;
create trigger limpiar_avisos after insert on public.notifications
  for each row execute function public.limpiar_avisos();

commit;
