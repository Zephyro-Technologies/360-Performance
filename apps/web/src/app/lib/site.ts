// The public origin of the storefront.
//
// VITE_SITE_URL is REQUIRED in production. Anything a crawler or a WhatsApp/Facebook scraper reads
// must be an ABSOLUTE url, and those scrapers do not run JavaScript — so `window.location.origin`
// is useless to them. It stays only as a dev/runtime fallback for links the visitor clicks in
// their own browser.
const CONFIGURED = (import.meta.env.VITE_SITE_URL || "").replace(/\/+$/, "");

export function siteOrigin(): string {
  if (CONFIGURED) return CONFIGURED;
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Canonical, shareable link to a product page. */
export function productUrl(slug: string): string {
  return absoluteUrl(`/product/${slug}`);
}
