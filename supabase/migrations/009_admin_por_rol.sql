-- =====================================================================
-- Paindex Vault — Migración 009: admin por rol, sin correo en el código
--
-- Antes, "ser admin" se comprobaba comparando el correo, que estaba escrito
-- en el código público. Ahora el admin es quien tiene role = "admin" en su
-- cuenta (app_metadata de Supabase, que los usuarios no pueden editar).
--
-- Al aplicarla, se le da el rol a la cuenta que publica los artículos del
-- portal (solo si es una única cuenta). No hace falta cerrar sesión.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

-- 1. Dar el rol a la cuenta que escribe los artículos
do $$
declare
  autores int;
begin
  select count(distinct user_id) into autores from public.posts;
  if autores = 1 then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
     where id = (select user_id from public.posts limit 1);
  elsif not exists (select 1 from auth.users where raw_app_meta_data ->> 'role' = 'admin') then
    raise notice 'No se pudo saber quién es el admin (% autores de artículos). Asigna el rol a mano: update auth.users set raw_app_meta_data = raw_app_meta_data || ''{"role":"admin"}'' where email = ''TU_CORREO'';', autores;
  end if;
end $$;

-- 2. Una sola comprobación de admin para todo (lee la cuenta, no el token,
--    así funciona sin volver a iniciar sesión)
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
      or exists (select 1 from auth.users u where u.id = auth.uid() and u.raw_app_meta_data ->> 'role' = 'admin');
$$;
grant execute on function public.es_admin() to anon, authenticated;

-- 3. Políticas que comparaban el correo
drop policy if exists "Solo admin edita y crea posts" on public.posts;
create policy "Solo admin edita y crea posts" on public.posts
  for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Solo admin edita hall of fame" on public.hall_of_fame;
create policy "Solo admin edita hall of fame" on public.hall_of_fame
  for update using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Borrar comentarios" on public.post_comments;
create policy "Borrar comentarios" on public.post_comments
  for delete using (auth.uid() = user_id or public.es_admin());

drop policy if exists "Solo admin gestiona borradores" on public.news_drafts_done;
create policy "Solo admin gestiona borradores" on public.news_drafts_done
  for all using (public.es_admin()) with check (public.es_admin());

-- 4. Esenciales automáticos: los juegos de la cuenta admin
create or replace function public.paindex_esenciales()
returns table (title text, cover_url text, rating numeric, status text, hours integer, tags text[], platforms text[])
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

commit;

-- Comprobación: debe devolver tu nombre de usuario
select p.username from auth.users u join public.profiles p on p.id = u.id where u.raw_app_meta_data ->> 'role' = 'admin';
