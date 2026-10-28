-- =====================================================================
-- Paindex Vault — Migración 004: Esenciales automáticos
--
-- Devuelve los juegos mejor puntuados del estante de Paindex (la cuenta con rol admin) (nota 9 o
-- más, o marcados como favoritos) para que la portada arme cada semana
-- una selección nueva. Solo expone lo necesario para mostrarlos: título,
-- portada, nota, estado, horas y etiquetas. Nada de otros usuarios.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

create or replace function public.paindex_esenciales()
returns table (
  title text,
  cover_url text,
  rating numeric,
  status text,
  hours integer,
  tags text[],
  platforms text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select g.title, g.cover_url, g.rating, g.status, g.hours, g.tags, g.platforms
  from public.games g
  join auth.users u on u.id = g.user_id
  where u.raw_app_meta_data ->> 'role' = 'admin'
    and (coalesce(g.rating, 0) >= 9 or g.favorite)
    and g.cover_url ~ '^https://'
  order by g.rating desc nulls last, g.hours desc nulls last
  limit 60;
$$;

revoke all on function public.paindex_esenciales() from public;
grant execute on function public.paindex_esenciales() to anon, authenticated;

commit;
