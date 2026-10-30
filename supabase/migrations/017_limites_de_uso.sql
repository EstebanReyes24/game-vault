-- =====================================================================
-- Paindex Vault — Migración 017: límites de uso
--
-- Las direcciones de la API se ven en el navegador (eso es normal en cualquier web);
-- lo que importa es que nadie pueda abusar de ellas. Aquí:
-- - usar_api(): cuenta cuántas veces por hora usa cada cuenta las importaciones
--   que gastan cuota de Paindex (Xbox y PlayStation). Lo llama el servidor con la
--   sesión del usuario, así que nadie puede gastar el cupo de otro.
-- - Tope de juegos por estante y de listas por usuario, para que nadie llene la base.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- =====================================================================

begin;

create table if not exists public.api_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  ruta    text not null check (char_length(ruta) <= 40),
  ventana timestamptz not null,
  conteo  int not null default 0,
  primary key (user_id, ruta, ventana)
);
alter table public.api_uso enable row level security;
-- sin políticas: solo se toca a través de usar_api()

create or replace function public.usar_api(p_ruta text, p_maximo int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hora timestamptz := date_trunc('hour', now());
  n int;
begin
  if uid is null then return false; end if;
  insert into public.api_uso (user_id, ruta, ventana, conteo)
  values (uid, left(p_ruta, 40), hora, 1)
  on conflict (user_id, ruta, ventana) do update set conteo = public.api_uso.conteo + 1
  returning conteo into n;
  if random() < 0.02 then
    delete from public.api_uso where ventana < now() - interval '1 day';
  end if;
  return n <= greatest(1, least(coalesce(p_maximo, 30), 1000));
end;
$$;
revoke all on function public.usar_api(text, int) from public;
grant execute on function public.usar_api(text, int) to authenticated;

-- Topes: 5.000 juegos por estante y 100 listas por usuario
create or replace function public.tope_juegos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.games where user_id = new.user_id) >= 5000 then
    raise exception 'Llegaste al máximo de 5.000 juegos en tu estante.';
  end if;
  return new;
end;
$$;
drop trigger if exists tope_juegos on public.games;
create trigger tope_juegos before insert on public.games
  for each row execute function public.tope_juegos();

create or replace function public.tope_listas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.lists where user_id = new.user_id) >= 100 then
    raise exception 'Llegaste al máximo de 100 listas.';
  end if;
  return new;
end;
$$;
drop trigger if exists tope_listas on public.lists;
create trigger tope_listas before insert on public.lists
  for each row execute function public.tope_listas();

commit;
