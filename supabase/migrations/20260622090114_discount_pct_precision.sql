-- ===========================================================================
-- Widen discount_pct so a percentage DERIVED FROM A PRICE round-trips exactly.
--
-- The invoice dialogs now let the operator just type the agreed price (1900 -> 1700) and
-- back-solve the percentage. That percentage is rarely round: 200/1900 = 10.526315789…%.
--
-- At the original numeric(5,4) the stored fraction truncated to 0.1053, and the server then
-- recomputed the discount as round(1900 * 0.1053, 2) = 200.07 — so the operator typed 1700 and
-- the invoice issued at 1699.93. Small, but it is the customer-facing number and it made the
-- price box lie about itself.
--
-- numeric(9,8) keeps 8 decimals on the fraction (0.10526316), so the recomputed discount lands
-- on 200.00 and the net is exactly 1700. Worst-case error is price * 5e-9 — sub-cent for any
-- realistic line, and the stored discount_pkr stays the authoritative rupee figure regardless.
--
-- Widening a numeric is not a rewrite of meaning: every existing value (4dp) is representable,
-- the 0..1 CHECK constraints carry over untouched, and no view or function needs redefining
-- (plpgsql binds the column type late).
-- ===========================================================================

alter table invoice_items alter column discount_pct type numeric(9,8);
alter table order_items   alter column discount_pct type numeric(9,8);

comment on column invoice_items.discount_pct is
  'Per-line discount as a fraction (0.10526316 = 10.526316% off). 8dp so a percentage derived from a typed price round-trips exactly. Operator-entered, or back-solved from an edited price.';
