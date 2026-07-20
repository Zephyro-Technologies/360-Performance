-- ===========================================================================
-- Phase 2 (Inventory & Cost Spine) — suppliers becomes the product-source VENDOR
-- MASTER (the dozen+ Chinese vendors). Kept named `suppliers` (established term;
-- distinct from `vendor_accounts`, the 3 PKR logistics vendors). Enriched, not renamed.
-- ===========================================================================
alter table suppliers add column active boolean not null default true;
alter table suppliers add column notes  text;
-- product-source vendors quote in RMB; the per-PO frozen rate does the conversion.
alter table suppliers alter column currency set default 'CNY';

-- vendor_accounts.supplier_id was unused future-proofing — product-source vendors
-- (suppliers) and logistics vendors (vendor_accounts) are deliberately disjoint.
alter table vendor_accounts drop column supplier_id;
