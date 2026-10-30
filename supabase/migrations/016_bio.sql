-- =====================================================================
-- Paindex Vault — Migración 016: descripción del perfil
-- Una frase corta (hasta 160 caracteres) que sale en tu perfil público.
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- =====================================================================
begin;
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_bio_largo;
alter table public.profiles add constraint profiles_bio_largo check (bio is null or char_length(bio) <= 160);
grant update (bio) on public.profiles to authenticated;
commit;
