import { useEffect } from "react";
import { siteOrigin } from "./site";

const BASE = "360 Performance";
const HOME_TITLE = `${BASE} | Genuine Motorsports Parts in Pakistan`;
const HOME_DESC =
  "Genuine performance car parts in Pakistan — exhausts, turbos, cooling, suspension and more. Shipped nationwide. Order on WhatsApp.";

// Query params that identify a genuinely DIFFERENT page worth indexing on its own. Everything else
// (?q=, ?sort=) is a view of the same set and must not spawn a duplicate canonical.
const CANONICAL_PARAMS = ["category", "page"];

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Canonical for the current route: path + only the params that make it a distinct page. */
function canonicalUrl(): string {
  const src = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const p of CANONICAL_PARAMS) {
    const v = src.get(p);
    // ?page=1 is the same page as no ?page at all — don't canonicalise a duplicate.
    if (v && !(p === "page" && v === "1")) keep.set(p, v);
  }
  const qs = keep.toString();
  return `${siteOrigin()}${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

/**
 * Per-route document title / description / og / canonical for this client-rendered SPA.
 *
 * NOTE: social scrapers (WhatsApp, Facebook, Twitter) do NOT execute JavaScript, so what they read
 * is the prerendered HTML — not this. This keeps the tags correct for the in-browser session and
 * for crawlers that do run JS; the build-time prerender is what feeds the scrapers.
 *
 * Every field is always written (never left stale): a route that passes no description used to
 * inherit the PREVIOUS route's description and canonical.
 */
export function useDocumentMeta(title?: string, description?: string, image?: string) {
  useEffect(() => {
    const full = title ? `${title} | ${BASE}` : HOME_TITLE;
    const desc = description || HOME_DESC;
    const url = canonicalUrl();
    const ogImage = image || `${siteOrigin()}/og-card.png`;

    document.title = full;
    upsertMeta('meta[property="og:title"]', "property", "og:title", full);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", full);

    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertMeta('meta[property="og:description"]', "property", "og:description", desc);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", desc);

    upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);

    upsertLink("canonical", url);
  }, [title, description, image]);
}
