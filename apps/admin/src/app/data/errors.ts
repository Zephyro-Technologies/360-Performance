// Map Supabase / Postgres errors (trigger messages, constraint codes, RLS) to
// friendly, user-facing text — never a raw Postgres code.
import type { PostgrestError } from "@supabase/supabase-js";

export function friendlyError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as PostgrestError;
    const msg = e.message ?? "";

    // Custom trigger / RPC business-rule messages (raised as check_violation).
    if (/exceeds the remaining balance/i.test(msg)) return "That payment is more than the invoice's remaining balance.";
    if (/reversal exceeds/i.test(msg)) return "You can't reverse more than that payment's remaining amount.";
    if (/referenced payment was not found/i.test(msg)) return "That payment couldn't be found on this invoice.";
    if (/voided/i.test(msg)) return "This invoice is voided. No further payments or reversals.";
    if (/can only use house stock/i.test(msg)) return "That would draw investor stock. Replacements and PR gifts must use house stock. Refund or compensate an investor item instead.";
    if (/only an admin can record a refund/i.test(msg)) return "Only an admin can record a refund.";
    if (/only an admin can edit an invoice/i.test(msg)) return "Only an admin can edit an invoice.";
    if (/not on this order's invoice/i.test(msg)) return "That payment isn't on this order's invoice.";
    if (/correction needs a reason/i.test(msg)) return "Add a reason for the correction.";
    if (/inclusive tax/i.test(msg)) return "Inclusive tax isn't configured yet. Ask an admin.";
    if (/leaf category|parent group/i.test(msg)) return "Choose a specific (child) category, not a top-level group.";
    if (/products_priced_when_published/i.test(msg)) return "Set a price before publishing this product.";
    if (/products_slug_when_published/i.test(msg)) return "Add a slug before publishing this product.";
    if (/products_sale_below_price/i.test(msg)) return "Sale price must be at or below the regular price.";
    if (/blog_body_when_published/i.test(msg)) return "Add body content before publishing this post.";
    if (/customer is required/i.test(msg)) return "Please choose or add a customer.";
    if (/at least one item/i.test(msg)) return "Add at least one item.";
    if (/product not found/i.test(msg)) return "One of the selected products is no longer available.";
    if (/quantity must be/i.test(msg)) return "Each item needs a quantity of at least 1.";
    if (/already has payments? recorded|already has a payment/i.test(msg)) return "This invoice already has a payment recorded, so its lines can't be edited. Reverse the payment first, or void and re-issue it.";
    if (/without a product needs a name/i.test(msg)) return "One of the lines has no product and no name. Remove it or give it a name.";
    switch (e.code) {
      case "23505":
        if (/one_per_order/i.test(msg)) return "This order already has an invoice. Void that invoice first to re-issue it.";
        if (/slug/i.test(msg)) return "That slug is already in use. Choose another.";
        return "That value is already in use. It must be unique.";
      case "23503":
        return /payment/i.test(msg)
          ? "This invoice has payments recorded. Void it instead of deleting."
          : "This record is still referenced elsewhere and can't be removed.";
      case "23514":
        // Our RPCs raise business rules with errcode = 'check_violation' too, so 23514 is NOT
        // always a column CHECK. Only a real constraint violation gets the generic text —
        // anything else is a hand-written message and is far more useful than "out of range".
        return /violates check constraint/i.test(msg) ? "A value is out of the allowed range." : msg;
      case "23502":
        return "A required field is missing.";
      case "42501":
        return "You don't have permission to do that.";
    }
    if (/row-level security/i.test(msg)) return "You don't have permission to do that.";
    if (msg) return msg;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
