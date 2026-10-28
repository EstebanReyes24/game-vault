-- =====================================================================
-- Paindex Vault — Limpieza única: notas inventadas por la importación de Steam
--
-- Antes de la Fase 0, la importación de Steam ponía nota 8.5 a todos los
-- juegos y la opinión "Importado automáticamente desde Steam.". Esa nota
-- no la puso nadie: infla la nota media, los Esenciales, los Tops y el Wrapped.
--
-- Este script SOLO toca juegos que cumplen las dos cosas a la vez:
--   nota exactamente 8.5  Y  opinión exactamente "Importado automáticamente desde Steam."
-- Les quita la nota y esa opinión automática. Lo demás (horas, estado,
-- portada) no cambia. Afecta a todas las cuentas que tengan ese problema.
--
-- CÓMO USARLO: Supabase → SQL Editor → pegar → Run.
-- Primero ejecuta solo el bloque 1 (vista previa) si quieres revisar.
-- =====================================================================

-- 1. Vista previa: qué se va a cambiar
select p.username, g.title, g.status, g.hours
from public.games g
join public.profiles p on p.id = g.user_id
where g.rating = 8.5 and g.notes = 'Importado automáticamente desde Steam.'
order by p.username, g.title;

-- 2. Limpieza
begin;
update public.games
   set rating = null,
       notes = null
 where rating = 8.5
   and notes = 'Importado automáticamente desde Steam.';

-- La actividad inicial que se creó con esas notas tampoco debe mostrarlas
update public.activity a
   set rating = null
  from public.games g
 where g.user_id = a.user_id and g.title = a.game_title
   and g.rating is null and a.rating = 8.5;
commit;
