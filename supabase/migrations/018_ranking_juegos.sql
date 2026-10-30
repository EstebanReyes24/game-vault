-- =====================================================================
-- Paindex Vault — Migración 018: índice de juegos (/juegos)
-- juegos_ranking(): los juegos de los estantes públicos, ordenados por
-- 'jugadores' (más registrados), 'nota' (mejor puntuados, mínimo 2 notas)
-- o 'platinos' (más platinados).
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- =====================================================================
begin;

create or replace function public.juegos_ranking(p_orden text default 'jugadores', p_limite int default 60)
returns table (clave text, titulo text, portada text, jugadores bigint, nota_media numeric, notas bigint, platinos bigint)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select public.clave_juego(g.title) as clave,
           (array_agg(g.title order by g.title))[1] as titulo,
           (array_agg(g.cover_url) filter (where g.cover_url ~ '^https://'))[1] as portada,
           count(*) as jugadores,
           round(avg(g.rating) filter (where g.rating > 0)::numeric, 1) as nota_media,
           count(*) filter (where g.rating > 0) as notas,
           count(*) filter (where g.status = 'platinum') as platinos
    from public.games g
    join public.profiles p on p.id = g.user_id and p.is_public
    where public.clave_juego(g.title) <> ''
    group by 1
  )
  select * from base
  where p_orden <> 'nota' or notas >= 2
  order by
    case when p_orden = 'nota' then nota_media end desc nulls last,
    case when p_orden = 'platinos' then platinos end desc,
    jugadores desc, nota_media desc nulls last, titulo
  limit least(greatest(coalesce(p_limite, 60), 1), 200);
$$;
grant execute on function public.juegos_ranking(text, int) to anon, authenticated;

commit;
