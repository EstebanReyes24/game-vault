-- =====================================================================
-- 020 · Métricas para el admin
-- - actividad_dias: qué días entra cada cuenta (una fila por cuenta y día)
-- - uso_funciones: qué funciones abre cada cuenta (una fila por cuenta, función y día,
--   así nadie puede inflar los números pulsando muchas veces)
-- - profiles.origen: de dónde llegó la persona la primera vez (YouTube, Google, un enlace…)
-- - metricas_admin(): todo resumido en un JSON, solo para el admin
-- =====================================================================
begin;

create table if not exists public.actividad_dias (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia     date not null default (now() at time zone 'utc')::date,
  primary key (user_id, dia)
);
create index if not exists actividad_dias_dia_idx on public.actividad_dias (dia);
alter table public.actividad_dias enable row level security;

create table if not exists public.uso_funciones (
  dia     date not null default (now() at time zone 'utc')::date,
  user_id uuid not null references auth.users(id) on delete cascade,
  funcion text not null check (funcion ~ '^[a-z_]{2,30}$'),
  primary key (dia, user_id, funcion)
);
alter table public.uso_funciones enable row level security;
-- sin políticas: solo se escribe con registrar_uso() y se lee con metricas_admin()

alter table public.profiles add column if not exists origen text;
alter table public.profiles drop constraint if exists profiles_origen_largo;
alter table public.profiles add constraint profiles_origen_largo check (origen is null or origen ~ '^[a-z0-9._-]{1,40}$');

-- Marca el día como activo y, si se indica, la función usada
create or replace function public.registrar_uso(p_funcion text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then return; end if;
  insert into actividad_dias (user_id, dia) values (auth.uid(), hoy) on conflict do nothing;
  if p_funcion is not null and p_funcion = any (array[
      'importar_steam','importar_xbox','importar_psn','pegar_lista','sincronizar','repetidos','completar_datos',
      'presumir','deseos','que_juego','wrapped','stats','top_cards','listas','mis_videos','registrar_juego',
      'resena','compartir_perfil','exportar','pagina_juego','comparar','ranking','lo_quiero','perfil',
      'usa_app','instalar_app','app_instalada','discord'
    ]) then
    insert into uso_funciones (dia, user_id, funcion) values (hoy, auth.uid(), p_funcion) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.registrar_uso(text) from public;
grant execute on function public.registrar_uso(text) to authenticated;

-- Se guarda una sola vez y solo en cuentas recién creadas
create or replace function public.poner_origen(p_origen text)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set origen = left(lower(regexp_replace(coalesce(p_origen, ''), '[^a-zA-Z0-9._-]', '', 'g')), 40)
   where id = auth.uid() and origen is null and created_at > now() - interval '3 days'
     and coalesce(p_origen, '') ~ '[a-zA-Z0-9]';
$$;
revoke all on function public.poner_origen(text) from public;
grant execute on function public.poner_origen(text) to authenticated;

create or replace function public.metricas_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'utc')::date;
  r jsonb;
begin
  if not es_admin() then raise exception 'Solo el admin puede ver las métricas'; end if;

  -- Días activos: los registrados desde ahora + lo que ya se sabía por la actividad de juegos y altas
  with _dias as (
    select user_id, dia from actividad_dias
    union select user_id, (created_at at time zone 'utc')::date from activity
    union select user_id, (created_at at time zone 'utc')::date from games
    union select id, (created_at at time zone 'utc')::date from profiles
  )
  select jsonb_build_object(
    'totales', jsonb_build_object(
      'usuarios',   (select count(*) from profiles),
      'publicos',   (select count(*) from profiles where is_public),
      'con_juegos', (select count(distinct user_id) from games),
      'juegos',     (select count(*) from games),
      'importaron', (select count(distinct user_id) from games where steam_appid is not null or xbox_title_id is not null or psn_np_id is not null),
      'steam',      (select count(*) from platform_links where steam_id is not null),
      'xbox',       (select count(*) from platform_links where xbox_gamertag is not null),
      'psn',        (select count(*) from platform_links where psn_online_id is not null),
      'resenas',    (select count(*) from reviews where not hidden),
      'seguimientos', (select count(*) from follows),
      'deseos',     (select count(*) from wishlist),
      'comentarios', (select count(*) from post_comments)
    ),
    'activos', jsonb_build_object(
      'hoy',  (select count(distinct user_id) from _dias where dia = hoy),
      'semana', (select count(distinct user_id) from _dias where dia > hoy - 7),
      'mes',  (select count(distinct user_id) from _dias where dia > hoy - 30)
    ),
    'por_dia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'activos', coalesce(a.n, 0), 'nuevos', coalesce(p.n, 0)) order by d), '[]')
        from generate_series(hoy - 29, hoy, interval '1 day') d
        left join (select dia, count(distinct user_id) n from _dias group by dia) a on a.dia = d::date
        left join (select (created_at at time zone 'utc')::date dia, count(*) n from profiles group by 1) p on p.dia = d::date
    ),
    -- De quienes se registraron hace 8–90 días: cuántos volvieron otro día dentro de su primera semana
    -- y cuántos siguen activos esta semana
    'retencion', (
      select jsonb_build_object(
        'cohorte', count(*),
        'volvieron_semana1', count(*) filter (where exists (
            select 1 from _dias x where x.user_id = p.id
              and x.dia > (p.created_at at time zone 'utc')::date
              and x.dia <= (p.created_at at time zone 'utc')::date + 7)),
        'activos_ahora', count(*) filter (where exists (select 1 from _dias x where x.user_id = p.id and x.dia > hoy - 7))
      ) from profiles p
      where p.created_at <= now() - interval '8 days' and p.created_at > now() - interval '90 days'
    ),
    'funciones', (
      select coalesce(jsonb_agg(jsonb_build_object('funcion', funcion, 'personas', n) order by n desc), '[]')
        from (select funcion, count(distinct user_id) n from uso_funciones where dia > hoy - 30 group by funcion) f
    ),
    'origenes', (
      select coalesce(jsonb_agg(jsonb_build_object('origen', o, 'personas', n) order by n desc), '[]')
        from (select coalesce(origen, 'sin dato') o, count(*) n from profiles where created_at > now() - interval '90 days' group by 1) x
    ),
    'juegos_semana', (
      select coalesce(jsonb_agg(jsonb_build_object('titulo', titulo, 'personas', n) order by n desc), '[]')
        from (select min(title) titulo, count(distinct user_id) n from games
               where created_at > now() - interval '7 days' group by clave_juego(title) order by 2 desc limit 8) j
    ),
    'recientes', (
      select coalesce(jsonb_agg(x order by x.creado desc), '[]') from (
        select p.username, p.created_at creado, p.origen, p.is_public publico,
               (select count(*) from games g where g.user_id = p.id) juegos,
               (select max(dia) from _dias d where d.user_id = p.id) ultimo_dia
          from profiles p order by p.created_at desc limit 15) x
    )
  ) into r;
  return r;
end;
$$;
revoke all on function public.metricas_admin() from public;
grant execute on function public.metricas_admin() to authenticated;

commit;
