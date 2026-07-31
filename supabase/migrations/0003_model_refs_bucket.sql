insert into storage.buckets (id, name, public) values ('model-refs', 'model-refs', true)
on conflict (id) do nothing;

create policy "authenticated upload model-refs"
on storage.objects for insert to authenticated
with check (bucket_id = 'model-refs');
