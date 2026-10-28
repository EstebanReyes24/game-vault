-- =====================================================================
-- Paindex Vault — Migración 003: borradores de noticias
--
-- Cada día una tarea programada deja borradores de noticias en
-- borradores/noticias.json (en el repo). Desde la portada, el admin los
-- revisa y pulsa "Publicar" o "Descartar". Esta tabla recuerda cuáles ya
-- se revisaron, para que no vuelvan a aparecer en ningún dispositivo.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

create table if not exists public.news_drafts_done (
  draft_id   text primary key,
  action     text not null check (action in ('publicado', 'descartado')),
  post_id    bigint references public.posts(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.news_drafts_done enable row level security;

drop policy if exists "Solo admin gestiona borradores" on public.news_drafts_done;
create policy "Solo admin gestiona borradores" on public.news_drafts_done
  for all
  using ((auth.jwt() ->> 'email') = 'estebanreyes2402@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'estebanreyes2402@gmail.com');

commit;
