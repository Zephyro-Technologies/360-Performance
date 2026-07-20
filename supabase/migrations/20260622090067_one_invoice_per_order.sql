-- ===========================================================================
-- One invoice per order — at most one NON-VOID invoice may link to a given order.
-- Voiding an invoice frees that order to be re-invoiced; standalone invoices (order_id
-- null) stay unrestricted (NULLs are distinct in a unique index). Enforces the clean
-- 1:1 order↔invoice link the UI now relies on.
-- ===========================================================================
create unique index invoices_one_per_order
  on invoices (order_id)
  where order_id is not null and voided_at is null;
