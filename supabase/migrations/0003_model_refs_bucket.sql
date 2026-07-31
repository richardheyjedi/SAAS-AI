insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('model-refs', 'model-refs', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated upload model-refs" on storage.objects;
create policy "authenticated upload model-refs"
on storage.objects for insert to authenticated
with check (bucket_id = 'model-refs');
