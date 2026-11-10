-- =====================================================================
-- 024 · Estantes públicos por defecto
-- 1. Las cuentas nuevas nacen con el estante público (cada quien puede hacerlo privado en «Mi perfil»).
-- 2. Las cuentas que ya tenían juegos y estaban en privado pasan a público, y en su próxima visita
--    ven un aviso con un botón para volver a privado.
-- =====================================================================
begin;

-- 1. Cuentas nuevas
alter table public.profiles alter column is_public set default true;

-- Cuándo se hizo público desde aquí (para avisar a esa persona una sola vez)
alter table public.profiles add column if not exists hecho_publico_el timestamptz;

-- La persona ya vio el aviso (lo deje público o lo vuelva a privado)
create or replace function public.aviso_publico_visto()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set hecho_publico_el = null where id = auth.uid();
$$;
revoke all on function public.aviso_publico_visto() from public;
grant execute on function public.aviso_publico_visto() to authenticated;

-- 2. Cuentas existentes con juegos que estaban en privado
update public.profiles p
   set is_public = true, hecho_publico_el = now()
 where not p.is_public
   and exists (select 1 from public.games g where g.user_id = p.id);

commit;
