-- =====================================================================
-- Paindex Vault — Migración 015: foto de perfil
--
-- - Bucket público "avatares" en Supabase Storage: cada usuario solo puede
--   subir, cambiar o borrar archivos dentro de su propia carpeta (su id).
--   Máximo 512 KB y solo imágenes (la web ya la recorta a 256×256 en WebP).
-- - profiles.avatar_url: solo puede apuntar a ese bucket.
-- - El admin puede quitar la foto de cualquiera (moderación).
--
-- CÓMO APLICARLA: Supabase → SQL Editor → New query → pegar → Run.
-- Se puede ejecutar varias veces sin problema.
-- =====================================================================

begin;

-- 1. Columna de la foto
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_avatar_url_formato;
alter table public.profiles add constraint profiles_avatar_url_formato check (
  avatar_url is null
  or avatar_url ~ '^https://epouactrnuhdbzzvzxor\.supabase\.co/storage/v1/object/public/avatares/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,60}(\?v=[0-9]{1,15})?$'
);
-- Cada uno puede cambiar su propia foto (la política "Cada usuario edita su perfil" limita la fila)
grant update (avatar_url) on public.profiles to authenticated;

-- 2. Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 524288, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 524288, allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg'];

drop policy if exists "Avatares: ver" on storage.objects;
create policy "Avatares: ver" on storage.objects for select
  using (bucket_id = 'avatares');

drop policy if exists "Avatares: subir el mío" on storage.objects;
create policy "Avatares: subir el mío" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatares: cambiar el mío" on storage.objects;
create policy "Avatares: cambiar el mío" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatares: borrar el mío o el admin" on storage.objects;
create policy "Avatares: borrar el mío o el admin" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- 3. El admin quita una foto inapropiada
create or replace function public.quitar_avatar(p_usuario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el admin puede quitar fotos de perfil';
  end if;
  update public.profiles set avatar_url = null where username = lower(p_usuario);
end;
$$;
revoke all on function public.quitar_avatar(text) from public;
grant execute on function public.quitar_avatar(text) to authenticated;

commit;
