-- =====================================================================
-- Game Vault • Paindex — Migración 002: borrado en cascada
--
-- PROBLEMA: algunas tablas apuntan a auth.users sin "ON DELETE CASCADE",
-- así que "Eliminar mi cuenta" fallaba con:
--   violates foreign key constraint "games_user_id_fkey" on table "games"
--
-- SOLUCIÓN: revisa TODAS las claves foráneas de las tablas de `public`
-- que apuntan a auth.users y las recrea con ON DELETE CASCADE.
-- Al borrar una cuenta se borran también su perfil, juegos, comentarios,
-- likes y publicaciones.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

do $$
declare
  fk record;
  new_def text;
begin
  for fk in
    select c.conname,
           c.conrelid::regclass as table_name,
           pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype <> 'c'          -- 'c' = ya tiene ON DELETE CASCADE
  loop
    -- Quita cualquier ON DELETE previo y añade CASCADE
    new_def := regexp_replace(fk.def, '\s+ON DELETE (NO ACTION|RESTRICT|SET NULL|SET DEFAULT)(\s*\([^)]*\))?', '', 'i')
               || ' ON DELETE CASCADE';

    execute format('alter table %s drop constraint %I', fk.table_name, fk.conname);
    execute format('alter table %s add constraint %I %s', fk.table_name, fk.conname, new_def);

    raise notice 'Corregida: %.% → %', fk.table_name, fk.conname, new_def;
  end loop;
end;
$$;

commit;

-- Comprobación (debe devolver 0 filas):
-- select conrelid::regclass, conname from pg_constraint
-- where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype <> 'c';
