-- Link an invoice back to the quotation it was promoted from (nullable — most invoices have
-- no source quote). on delete set null so deleting a quotation never cascades to its invoice.
alter table invoices
  add column quotation_id uuid references quotations(id) on delete set null;
create index invoices_quotation_idx on invoices(quotation_id);
