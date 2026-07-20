-- ===========================================================================
-- culture-videos — public-read bucket for the owner's own drifting clips shown
-- in the "Car Culture" section of the storefront landing page.
--
-- PUBLIC read (like product-images / blog-images, unlike the private
-- expense-receipts bucket) because anon visitors must be able to stream them.
-- Writes stay staff/admin only, so nobody can push media through the anon key.
--
-- The storefront references objects by BUCKET-RELATIVE PATH and resolves them
-- through imageUrl() (a pure getPublicUrl string build), so the same reference
-- works against local and cloud without an env-specific URL baked into the code.
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('culture-videos', 'culture-videos', true)
on conflict (id) do nothing;

create policy "culture read"   on storage.objects for select to anon, authenticated
  using (bucket_id = 'culture-videos');
create policy "culture insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'culture-videos' and has_role(array['admin','staff']::user_role[]));
create policy "culture update" on storage.objects for update to authenticated
  using (bucket_id = 'culture-videos' and has_role(array['admin','staff']::user_role[]));
create policy "culture delete" on storage.objects for delete to authenticated
  using (bucket_id = 'culture-videos' and has_role(array['admin','staff']::user_role[]));
