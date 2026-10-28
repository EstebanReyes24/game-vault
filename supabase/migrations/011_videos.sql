-- =====================================================================
-- Paindex Vault — Migración 011: "Para mis videos" (privado)
--
-- Banco de ideas del canal: a cada juego del estante se le puede asignar
-- un estado de video (idea, guion, grabando, publicado), el enlace y notas.
-- Es PRIVADO: solo lo ve su dueño, aunque el estante sea público.
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

create table if not exists public.video_plans (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_title text not null check (char_length(game_title) between 1 and 200),
  estado     text not null check (estado in ('idea', 'guion', 'grabando', 'publicado')),
  url        text check (url is null or url ~ '^https://[^\s"''<>]+$'),
  notas      text check (notas is null or char_length(notas) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_title)
);
alter table public.video_plans enable row level security;

drop policy if exists "Solo el dueño ve sus planes de video" on public.video_plans;
create policy "Solo el dueño ve sus planes de video" on public.video_plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
