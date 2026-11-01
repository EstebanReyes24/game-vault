-- =====================================================================
-- 022 · Diagnóstico de las notificaciones en el teléfono (solo admin)
-- Dice si falta algo: ajustes guardados, dispositivos activados y qué respondió /api/push
-- en los últimos envíos (pg_net guarda las respuestas unas horas).
-- =====================================================================
create or replace function public.diagnostico_push()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not es_admin() then raise exception 'Solo el admin'; end if;
  select jsonb_build_object(
    'url_guardada', (select valor from privado.ajustes where clave = 'push_url'),
    'secreto_guardado', exists (select 1 from privado.ajustes where clave = 'push_secreto' and length(valor) >= 32),
    'mis_dispositivos', (select count(*) from push_subs where user_id = auth.uid()),
    'dispositivos_total', (select count(*) from push_subs),
    'mis_ultimos_avisos', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'cuando', created_at) order by created_at desc), '[]')
                             from (select kind, created_at from notifications where user_id = auth.uid() order by created_at desc limit 3) a),
    'envios', (select coalesce(jsonb_agg(jsonb_build_object('estado', status_code, 'error', error_msg, 'tiempo_agotado', timed_out,
                                                            'respuesta', left(content, 200), 'cuando', created) order by created desc), '[]')
                 from (select * from net._http_response order by created desc limit 5) x)
  ) into r;
  return r;
end;
$$;
revoke all on function public.diagnostico_push() from public;
grant execute on function public.diagnostico_push() to authenticated;
