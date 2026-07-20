-- ===========================================================================
-- Track whether an order line's item / shipping payment was settled FROM VENDOR CREDIT
-- (a draw-down of the vendor's prepaid balance) versus new money. Purely informational for the
-- "Payments made" list; defaults to false (new money) for all existing payments.
-- ===========================================================================
alter table purchase_order_lines
  add column item_paid_from_credit boolean not null default false,
  add column ship_paid_from_credit boolean not null default false;
