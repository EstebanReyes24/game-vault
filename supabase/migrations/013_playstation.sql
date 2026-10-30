-- =====================================================================
-- Paindex Vault — Migración 013: PlayStation
--
-- - Cada juego puede guardar su lista de trofeos de PlayStation (npCommunicationId).
-- - Cada usuario puede guardar (en privado) su ID de PSN para "Actualizar".
-- - Los trofeos se guardan igual que los logros de Steam y Xbox.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema. Requiere la 012.
-- =====================================================================

begin;

alter table public.games add column if not exists psn_np_id   text;
alter table public.games add column if not exists psn_service text;

alter table public.games drop constraint if exists games_psn_np_id_formato;
alter table public.games add constraint games_psn_np_id_formato
  check (psn_np_id is null or psn_np_id ~ '^NPWR[0-9]{5}_[0-9]{2}$') not valid;
alter table public.games drop constraint if exists games_psn_service_valido;
alter table public.games add constraint games_psn_service_valido
  check (psn_service is null or psn_service in ('trophy', 'trophy2')) not valid;

alter table public.platform_links add column if not exists psn_online_id  text;
alter table public.platform_links add column if not exists psn_account_id text;
alter table public.platform_links drop constraint if exists platform_links_psn_online_id_formato;
alter table public.platform_links add constraint platform_links_psn_online_id_formato
  check (psn_online_id is null or psn_online_id ~ '^[A-Za-z][A-Za-z0-9_-]{2,15}$');
alter table public.platform_links drop constraint if exists platform_links_psn_account_id_formato;
alter table public.platform_links add constraint platform_links_psn_account_id_formato
  check (psn_account_id is null or psn_account_id ~ '^[0-9]{1,25}$');

-- Los trofeos de PlayStation se guardan con source = 'psn'
alter table public.game_achievements drop constraint if exists game_achievements_source_check;
alter table public.game_achievements add constraint game_achievements_source_check
  check (source in ('steam', 'xbox', 'psn'));

commit;
