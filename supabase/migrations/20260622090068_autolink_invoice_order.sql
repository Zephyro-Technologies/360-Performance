-- ===========================================================================
-- Auto-create + link an order when a STANDALONE invoice gets paid.
--
-- Normal flow is order-first (order → invoice), so the invoice carries order_id.
-- But an invoice can be raised on its own (order_id null). The moment such an
-- invoice takes any money (net payments > 0 → partial or fully paid), the sale is
-- real and belongs in the pipeline. This trigger creates that order — snapshotting
-- the invoice's own lines (name/sku/qty/price, so one-off lines survive) — parks it
-- at the 'received' stage, and links it back onto the invoice (invoices.order_id).
--
-- Like create_order, this draws NO stock (stock is only drawn when a line is
-- fulfilled), so there are no stock/economics side effects — it just puts the sale
-- on the board so it can be fulfilled. SECURITY DEFINER so the order/order_items
-- inserts and the invoice link run in owner context regardless of who paid.
-- Fires on payment INSERT; a reversal can't re-fire it because the first payment
-- already set order_id (the early-out below).
-- ===========================================================================
create or replace function autolink_invoice_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_net     numeric;
  v_order_id uuid;
begin
  select * into v_inv from invoices where id = new.invoice_id;
  if v_inv.id is null then return null; end if;
  if v_inv.order_id is not null then return null; end if;   -- already on the board
  if v_inv.voided_at is not null then return null; end if;  -- void invoice, ignore

  -- Net money on the invoice (payments minus reversals). Only act once it's positive.
  select coalesce(sum(case when kind = 'reversal' then -amount_pkr else amount_pkr end), 0)
    into v_net from payments where invoice_id = new.invoice_id;
  if v_net <= 0 then return null; end if;

  insert into orders (customer_id, stage, notes)
  values (v_inv.customer_id, 'received',
          'Auto-created from paid invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  -- Snapshot the invoice's own lines (not a fresh product lookup) so prices match
  -- the billed document and one-off (product_id null) lines carry over intact.
  insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty, ii.price_pkr
  from invoice_items ii
  where ii.invoice_id = new.invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id;

  update invoices set order_id = v_order_id where id = new.invoice_id;
  return null;
end $$;

create trigger autolink_invoice_order
  after insert on payments
  for each row execute function autolink_invoice_order();
