alter table public.inventory_items
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-product-images', 'business-product-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "Workspace members can view product images" on storage.objects;
create policy "Workspace members can view product images"
on storage.objects for select to authenticated
using (
  bucket_id = 'business-product-images'
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = (storage.foldername(name))[1]::uuid
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "Workspace managers can upload product images" on storage.objects;
create policy "Workspace managers can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-product-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','manager'])
);

drop policy if exists "Workspace managers can update product images" on storage.objects;
create policy "Workspace managers can update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'business-product-images'
  and private.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','manager'])
)
with check (
  bucket_id = 'business-product-images'
  and private.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','manager'])
);

drop policy if exists "Workspace managers can delete product images" on storage.objects;
create policy "Workspace managers can delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'business-product-images'
  and private.has_workspace_role((storage.foldername(name))[1]::uuid, array['owner','admin','manager'])
);
