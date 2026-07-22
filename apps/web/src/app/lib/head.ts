import { useEffect } from "react";
import { useLocation } from "react-router";
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

function buildCanonical(pathname: string, params: Iterable<[string, string]>): string {
  const keep = new URLSearchParams();
  for (const [p, v] of params) {
    // ?page=1 is the same page as no ?page at all — don't canonicalise a duplicate.
    if (v && !(p === "page" && v === "1")) keep.set(p, v);
  }
  const qs = keep.toString();
  return `${siteOrigin()}${pathname}${qs ? `?${qs}` : ""}`;
}

export type MetaOptions = {
  /** Overrides the default "index, follow" — e.g. "noindex, follow" for the 404 page. */
  robots?: string;
  /**
   * The canonical query params the page ACTUALLY rendered, validated and clamped. Supplying these
   * stops a bogus `?category=x` or an out-of-range `?page=99` from self-canonicalising a URL the
   * page silently coerced away from. Omit to fall back to reading the raw URL.
   */
  canonicalParams?: Record<string, string | number | null | undefined>;
  /** Human description of the share image, for og:image:alt / twitter:image:alt. */
  imageAlt?: string;
};

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
export function useDocumentMeta(
  title?: string,
  description?: string,
  image?: string,
  opts?: MetaOptions,
) {
  const robots = opts?.robots ?? "index, follow";
  const imageAlt = opts?.imageAlt;
  // Reactive path/search so the canonical recomputes on a route change even when the title and
  // description stay the same (e.g. a redirect between two "Shop All Parts" URLs).
  const { pathname, search } = useLocation();
  // Stable dep for the params object (recreated each render otherwise).
  const paramsKey = opts?.canonicalParams ? JSON.stringify(opts.canonicalParams) : "";
  useEffect(() => {
    const full = title ? `${title} | ${BASE}` : HOME_TITLE;
    const desc = description || HOME_DESC;
    const url = opts?.canonicalParams
      ? buildCanonical(
          pathname,
          Object.entries(opts.canonicalParams)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => [k, String(v)] as [string, string]),
        )
      : buildCanonical(
          pathname,
          CANONICAL_PARAMS.map((p) => [p, new URLSearchParams(search).get(p) ?? ""] as [string, string]),
        );
    const ogImage = image || `${siteOrigin()}/og-card.png`;
    const alt = imageAlt || (image ? title || BASE : `${BASE} — genuine motorsports parts`);

    document.title = full;
    upsertMeta('meta[property="og:title"]', "property", "og:title", full);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", full);

    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertMeta('meta[property="og:description"]', "property", "og:description", desc);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", desc);

    upsertMeta('meta[property="og:image"]', "property", "og:image", ogImage);
    upsertMeta('meta[property="og:image:alt"]', "property", "og:image:alt", alt);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", ogImage);
    upsertMeta('meta[name="twitter:image:alt"]', "name", "twitter:image:alt", alt);
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:locale"]', "property", "og:locale", "en_PK");

    // Always set robots so the 404's noindex never lingers onto the next route.
    upsertMeta('meta[name="robots"]', "name", "robots", robots);

    upsertLink("canonical", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, image, robots, imageAlt, paramsKey, pathname, search]);
}
