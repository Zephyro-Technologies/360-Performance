-- ===========================================================================
-- Expense receipts — attach a receipt image/PDF to an expense for audit.
-- Unlike product-images/blog-images (public-read), a receipt is a PRIVATE financial
-- document (vendor names, amounts) so it lives in its OWN private bucket, readable +
-- writable by staff/admin ONLY, never anon. The DB stores a bucket-relative path; the
-- app resolves it to a short-lived SIGNED url at view time. Documentation only — it does
-- NOT affect any figure (Money out / profit are unchanged).
-- ===========================================================================

alter table expenses add column receipt_path text;

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do nothing;

-- Private: staff/admin only for every operation; anon has no policy → no access at all.
create policy "receipts read"   on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and has_role(array['admin','staff']::user_role[]));
create policy "receipts insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and has_role(array['admin','staff']::user_role[]));
create policy "receipts update" on storage.objects for update to authenticated
  using (bucket_id = 'expense-receipts' and has_role(array['admin','staff']::user_role[]));
create policy "receipts delete" on storage.objects for delete to authenticated
  using (bucket_id = 'expense-receipts' and has_role(array['admin','staff']::user_role[]));
