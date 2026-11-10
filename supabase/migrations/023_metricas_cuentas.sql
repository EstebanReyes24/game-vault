-- =====================================================================
-- 023 · Métricas de cuentas (solo admin): cuántas confirmaron el correo, con qué entraron
-- y cuántas se quedaron con el estante vacío. Sirve para ver dónde se pierde la gente al registrarse.
-- =====================================================================
create or replace function public.metricas_cuentas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not es_admin() then raise exception 'Solo el admin puede ver las métricas'; end if;
  select jsonb_build_object(
    'registradas', count(*),
    'sin_confirmar_correo', count(*) filter (where u.email_confirmed_at is null),
    'con_google', count(*) filter (where u.raw_app_meta_data->>'provider' = 'google'),
    'con_correo', count(*) filter (where coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'),
    'sin_juegos', count(*) filter (where not exists (select 1 from games g where g.user_id = u.id)),
    'sin_juegos_y_sin_confirmar', count(*) filter (where u.email_confirmed_at is null and not exists (select 1 from games g where g.user_id = u.id)),
    'sin_juegos_confirmadas', count(*) filter (where u.email_confirmed_at is not null and not exists (select 1 from games g where g.user_id = u.id)),
    'entraron_una_sola_vez', count(*) filter (where u.last_sign_in_at is null or u.last_sign_in_at < u.created_at + interval '1 day')
  ) into r
  from auth.users u;
  return r;
end;
$$;
revoke all on function public.metricas_cuentas() from public;
grant execute on function public.metricas_cuentas() to authenticated;
