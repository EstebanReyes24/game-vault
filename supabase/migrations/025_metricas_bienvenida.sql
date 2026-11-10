-- =====================================================================
-- 025 · Métricas de la bienvenida y de la actualización automática
-- Añade a lo que se puede contar: quién vio la bienvenida (estante vacío), cómo terminó cada
-- importación (bien, perfil privado o error) y cuándo el estante se actualizó solo y mostró novedades.
-- =====================================================================
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
      'usa_app','instalar_app','app_instalada','discord',
      'bienvenida_vista','importacion_ok','importacion_privada','importacion_fallo','sync_auto','novedades'
    ]) then
    insert into uso_funciones (dia, user_id, funcion) values (hoy, auth.uid(), p_funcion) on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.registrar_uso(text) from public;
grant execute on function public.registrar_uso(text) to authenticated;
