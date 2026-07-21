import { formatPKR } from "./format";

// Resolve config from the consuming Vite app's env without coupling this shared
// package to any one app's ImportMetaEnv typing.
const env =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const WHATSAPP_NUMBER = env.VITE_WHATSAPP_NUMBER || "923003600360";
export const WHATSAPP_DISPLAY = env.VITE_WHATSAPP_DISPLAY || "+92 300 3600360";

// Minimal structural shape so this package doesn't depend on the web app's
// Product type (any product with these fields is accepted).
export interface WhatsAppProduct {
  name: string;
  sku: string;
  pricePKR: number;
  /** Discounted price when the product is on sale. The order MUST quote this, not pricePKR. */
  salePricePKR?: number | null;
  /** Absolute link to the product page, so whoever answers sees exactly what the customer saw. */
  url?: string;
}

/**
 * The prefilled order message — the single most important artifact on the site, since every sale
 * is closed by hand on WhatsApp.
 *
 * It MUST quote the price the customer actually saw. A product on sale renders the sale price and
 * strikes through pricePKR, so quoting pricePKR here would open WhatsApp with the higher,
 * crossed-out number — losing the sale or forcing a climbdown. Identify the part by SKU + link
 * (a UUID means nothing to whoever answers the phone).
 */
export function whatsappOrderUrl(product: WhatsAppProduct): string {
  // A non-positive price means "unpriced", not "free". Emitting "• Rs 0" invited customers to
  // ask for a free part, so the price line is omitted entirely and we ask instead.
  const priced = typeof product.pricePKR === "number" && product.pricePKR > 0;
  const onSale =
    priced && product.salePricePKR != null && product.salePricePKR > 0 && product.salePricePKR < product.pricePKR;
  const price = onSale ? product.salePricePKR! : product.pricePKR;

  const lines = [
    `Hi 360 Performance, I'd like to order:`,
    ``,
    `• ${product.name}`,
    `• SKU: ${product.sku}`,
  ];
  if (priced) {
    lines.push(
      `• ${formatPKR(price)}${onSale ? ` (sale price — was ${formatPKR(product.pricePKR)})` : ""}`,
    );
  } else {
    lines.push(`• Please confirm the price`);
  }
  if (product.url) lines.push(`• ${product.url}`);
  lines.push(``, `Please confirm availability and dispatch.`);

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function whatsappGeneralUrl(message?: string): string {
  const text = message ?? "Hi 360 Performance, I'd like to ask about a part.";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function whatsappBlogUrl(postTitle: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Hi 360 Performance, I read "${postTitle}" — could you help me spec the right parts for my build?`,
  )}`;
}
