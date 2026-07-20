-- Manually put an invoice's sale onto the order pipeline, on demand (a button on the invoice),
-- WITHOUT waiting for payment. Mirrors autolink_invoice_order (090068) exactly — snapshots the
-- invoice's own lines, parks the order at 'received', links invoices.order_id — but is called
-- explicitly. Idempotent: if the invoice already has an order (auto-linked on payment, or a
-- prior click), it just returns that order. Draws NO stock (stock is drawn at fulfilment).
create or replace function link_invoice_order(p_invoice_id uuid)
returns orders
language plpgsql security definer set search_path = public as $$
declare
  v_inv      invoices;
  v_order    orders;
  v_order_id uuid;
begin
  if not has_role(array['admin','staff']::user_role[]) then
    raise exception 'Not authorized.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_inv from invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'no_data_found';
  end if;
  if v_inv.voided_at is not null then
    raise exception 'This invoice is voided.' using errcode = 'check_violation';
  end if;

  -- Already on the board (auto-linked on payment or a previous click) → return it, no dup.
  if v_inv.order_id is not null then
    select * into v_order from orders where id = v_inv.order_id;
    return v_order;
  end if;

  insert into orders (customer_id, stage, notes)
  values (v_inv.customer_id, 'received',
          'From invoice ' || coalesce(v_inv.invoice_no, ''))
  returning id into v_order_id;

  insert into order_items (order_id, product_id, name, sku, qty, price_pkr)
  select v_order_id, ii.product_id, ii.name, ii.sku, ii.qty, ii.price_pkr
  from invoice_items ii
  where ii.invoice_id = p_invoice_id;

  update orders
  set total_pkr = (select coalesce(sum(qty * price_pkr), 0) from order_items where order_id = v_order_id)
  where id = v_order_id
  returning * into v_order;

  update invoices set order_id = v_order_id where id = p_invoice_id;
  return v_order;
end $$;

revoke all on function link_invoice_order(uuid) from public;
grant execute on function link_invoice_order(uuid) to authenticated;
