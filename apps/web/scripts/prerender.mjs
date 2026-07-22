// Build-time prerender of the storefront's per-page <head>.
//
// WHY: the site is a client-rendered SPA, and social scrapers (WhatsApp, Facebook, Twitter) do NOT
// execute JavaScript. They read the raw HTML — which, for every URL, was the same static shell. So
// every product a customer shared on WhatsApp previewed as the generic homepage. For a business
// whose entire order flow IS people forwarding links on WhatsApp, that is the single most expensive
// bug on the site.
//
// WHAT: after `vite build`, emit a real HTML file per product and per blog post — same JS bundle,
// but with that page's <title>, description, canonical, og:*/twitter:* and Product JSON-LD baked in.
// Scrapers and crawlers get the truth; the SPA still boots and takes over for humans.
// Also emits sitemap.xml + robots.txt, neither of which existed.
//
// Degrades safely on a local build (no Supabase env → log and skip), but HARD FAILS on a real
// deploy — see the note on bail() below.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SITE = (process.env.VITE_SITE_URL || "").replace(/\/+$/, "");

const BRAND = "360 Performance";

// On a DEPLOY a missing variable must not pass silently. Without VITE_SITE_URL the build still
// goes green while publishing index.html with UNREPLACED `%VITE_SITE_URL%` placeholders in
// og:url / og:image, and zero prerendered pages — so every link shared on WhatsApp previews as
// the generic homepage. That is precisely the bug this script exists to prevent, so a deploy
// that cannot do its job fails loudly instead of shipping.
//
// Keyed on the deploy environment, deliberately NOT on generic `CI`: the GitHub verify job runs
// `pnpm build` with no VITE_* vars at all, purely to typecheck/bundle and grep the output for
// leaked keys. That build must keep skipping quietly.
// Cloudflare Workers Builds sets WORKERS_CI; Cloudflare Pages sets CF_PAGES.
const IS_DEPLOY = !!(process.env.WORKERS_CI || process.env.CF_PAGES);

function bail(msg) {
  if (IS_DEPLOY) {
    console.error(`[prerender] FAILED — ${msg}`);
    console.error("[prerender] Refusing to publish a deploy with broken share metadata.");
    console.error("[prerender] Set the missing build variable in the Cloudflare dashboard and redeploy.");
    process.exit(1);
  }
  console.warn(`[prerender] SKIPPED — ${msg}`);
  process.exit(0);
}

if (!existsSync(path.join(DIST, "index.html"))) bail("dist/index.html not found; run vite build first.");
if (!SUPABASE_URL || !ANON) bail("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set.");
if (!SITE) bail("VITE_SITE_URL not set — absolute URLs are required for share previews.");

/** Query the public REST surface as anon. Only published, public rows are visible (RLS). */
async function q(table, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Mirror of imageUrl() in @360/supabase: bucket-relative path -> public URL; absolute passes through. */
function publicImage(bucket, value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${value}`;
}

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Rewrite the <head> of the shell for one route. */
function render(shell, { title, description, url, image, imageAlt, jsonLd, robots, ogType, extraMeta }) {
  let html = shell;
  const set = (re, replacement) => {
    html = re.test(html) ? html.replace(re, replacement) : html;
  };

  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  set(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(description)}" />`);
  set(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(title)}" />`);
  set(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${esc(description)}" />`,
  );
  set(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(url)}" />`);
  set(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${esc(image)}" />`);
  set(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  set(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  );
  set(/<meta name="twitter:image" content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  if (imageAlt) {
    set(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/, `<meta property="og:image:alt" content="${esc(imageAlt)}" />`);
    set(/<meta name="twitter:image:alt" content="[^"]*"\s*\/?>/, `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`);
  }
  if (ogType) set(/<meta property="og:type" content="[^"]*"\s*\/?>/, `<meta property="og:type" content="${esc(ogType)}" />`);
  if (robots) set(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${esc(robots)}" />`);

  const extra =
    `\n    <link rel="canonical" href="${esc(url)}" />` +
    (extraMeta ? extraMeta.map((m) => `\n    ${m}`).join("") : "") +
    // Escape "<" exactly as components/JsonLd.tsx does, so an author-written product name or
    // description containing "</script>" cannot terminate the head of the prerendered page —
    // the one file social scrapers and crawlers actually read.
    (jsonLd
      ? `\n    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`
      : "");
  return html.replace("</head>", `${extra}\n  </head>`);
}

// Grounded Offer enrichment — MUST match src/app/lib/jsonld.ts offerExtras(). Real values only:
// new genuine parts, the 7-day returns window from the returns policy, us as seller.
// priceValidUntil is the conventional far-future date that silences the "no expiry" warning.
function offerExtras() {
  return {
    itemCondition: "https://schema.org/NewCondition",
    priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
    seller: { "@type": "Organization", name: BRAND },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "PK",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
    },
  };
}

async function emit(route, html) {
  const dir = path.join(DIST, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");
}

const shell = await readFile(path.join(DIST, "index.html"), "utf8");

// ---- products -----------------------------------------------------------------------------
// updated_at (migration 090122) gives the sitemap an accurate <lastmod>. Requested optimistically
// and dropped if the column isn't exposed yet, so this build works whether or not the migration
// has been pushed — no deploy-ordering coupling.
const PRODUCT_COLS = "slug,name,brand,sku,mpn,price_pkr,sale_price_pkr,images,short_description,meta_description,availability,created_at";
let products;
try {
  products = await q("products_public", `select=${PRODUCT_COLS},updated_at`);
} catch {
  console.warn("[prerender] products_public.updated_at not exposed yet (migration 090122) — sitemap lastmod falls back to created_at");
  products = await q("products_public", `select=${PRODUCT_COLS}`);
}

// Keyed on the RAW DB enum (products_public.availability), unlike lib/jsonld.ts which maps the
// hyphenated view-model values. `made_to_order` is the column DEFAULT, so omitting it here made
// most products advertise InStock to crawlers while the page itself said "Made to order".
const AVAIL = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  made_to_order: "https://schema.org/MadeToOrder",
  out_of_stock: "https://schema.org/OutOfStock",
};

for (const p of products) {
  const url = `${SITE}/product/${p.slug}`;
  const image = publicImage("product-images", (p.images ?? [])[0]) || `${SITE}/og-card.png`;
  const price = p.sale_price_pkr != null && p.sale_price_pkr < p.price_pkr ? p.sale_price_pkr : p.price_pkr;
  const description =
    p.meta_description || p.short_description || `${p.name} — genuine performance parts, shipped across Pakistan.`;

  await emit(
    `product/${p.slug}`,
    render(shell, {
      title: `${p.name} | ${BRAND}`,
      description,
      url,
      image,
      imageAlt: p.name,
      ogType: "product",
      // Facebook/WhatsApp render a price line under the title from these.
      extraMeta: [
        `<meta property="product:price:amount" content="${esc(String(price))}" />`,
        `<meta property="product:price:currency" content="PKR" />`,
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        sku: p.sku,
        ...(p.mpn ? { mpn: p.mpn } : {}),
        ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
        description,
        image: [image],
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: "PKR",
          price: String(price),
          // Fallback matches data/api.ts, which also defaults an unknown value to made-to-order.
          // Claiming InStock for something we cannot classify is the expensive way to be wrong.
          availability: AVAIL[p.availability] ?? "https://schema.org/MadeToOrder",
          ...offerExtras(),
        },
      },
    }),
  );
}

// ---- static routes ------------------------------------------------------------------------
// Without these, /catalogue, /blog and the policy pages fall through to the SPA shell and preview
// as the homepage — and category links (?category=…), which are exactly what a seller pastes into
// a chat, resolve to /catalogue on Cloudflare (query ignored for asset matching) and so inherit
// the catalogue page's meta rather than the homepage's. Titles/descriptions MUST match the runtime
// pages (Catalogue.tsx, Blog.tsx, PolicyPage.tsx) so scrapers and JS crawlers agree.
const STATIC_PAGES = [
  {
    route: "catalogue",
    title: `Shop All Parts | ${BRAND}`,
    description:
      "Browse the full 360 Performance catalogue — genuine performance parts for exhausts, cooling, fuelling, suspension and more, shipped across Pakistan.",
  },
  {
    route: "blog",
    title: `News | ${BRAND}`,
    description:
      "Build notes, part guides and straight talk on the Pakistani motorsports scene — from the 360 Performance garage.",
  },
  {
    route: "policies/returns",
    title: `Return & Refund Policy | ${BRAND}`,
    description:
      "We want you running the right parts. If something isn't right, here's how returns and refunds work at 360 Performance.",
  },
  {
    route: "policies/shipping",
    title: `Shipping Policy | ${BRAND}`,
    description:
      "360 Performance is an order-based store shipping nationwide across Pakistan. Here's what to expect after you place an order.",
  },
  {
    route: "policies/privacy",
    title: `Privacy Policy | ${BRAND}`,
    description:
      "Your trust matters. This policy explains what data 360 Performance collects, how we use it, and the rights you have over it.",
  },
];

for (const s of STATIC_PAGES) {
  await emit(s.route, render(shell, { title: s.title, description: s.description, url: `${SITE}/${s.route}` }));
}

// A noindex 404 for hosts that serve it (Cloudflare's SPA fallback serves index.html instead, so
// the runtime NotFound page also sets noindex — this covers the rest).
await writeFile(
  path.join(DIST, "404.html"),
  render(shell, {
    title: `Page Not Found | ${BRAND}`,
    description: "That page doesn't exist. Browse the catalogue or search for a part.",
    url: `${SITE}/404`,
    robots: "noindex, follow",
  }),
  "utf8",
);

// ---- blog ---------------------------------------------------------------------------------
const posts = await q("blog_posts", "select=slug,title,excerpt,hero_image,published_at&published=eq.true");

for (const b of posts) {
  const url = `${SITE}/blog/${b.slug}`;
  const hasHero = !!publicImage("blog-images", b.hero_image);
  const image = hasHero ? publicImage("blog-images", b.hero_image) : `${SITE}/og-card.png`;
  const description = b.excerpt || `${b.title} — from the ${BRAND} garage.`;
  await emit(
    `blog/${b.slug}`,
    render(shell, {
      title: `${b.title} | ${BRAND}`,
      description,
      url,
      image,
      imageAlt: b.title,
      ogType: "article",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: b.title,
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: BRAND },
        publisher: { "@type": "Organization", name: BRAND },
        ...(description ? { description } : {}),
        ...(hasHero ? { image: [image] } : {}),
        ...(b.published_at ? { datePublished: b.published_at } : {}),
      },
    }),
  );
}

// ---- categories -----------------------------------------------------------------------------
// A prerendered page per category (/catalogue/<slug>) so a shared category link — exactly what a
// seller pastes into a chat — previews with that category's own title + description instead of the
// generic catalogue. Titles/descriptions match the runtime Catalogue page for a category.
const categories = await q("categories", "select=slug,name,parent_id");
for (const c of categories) {
  await emit(
    `catalogue/${c.slug}`,
    render(shell, {
      title: `${c.name} | ${BRAND}`,
      description: `Browse ${c.name} parts at ${BRAND} — genuine, hand-picked, shipped across Pakistan. Order on WhatsApp.`,
      url: `${SITE}/catalogue/${c.slug}`,
    }),
  );
}
const parentCats = categories.filter((c) => c.parent_id === null);
const leafCats = categories.filter((c) => c.parent_id !== null);

// ---- sitemap + robots ---------------------------------------------------------------------
const urls = [
  { loc: `${SITE}/`, priority: "1.0" },
  // A hub page outranks the individual products beneath it.
  { loc: `${SITE}/catalogue`, priority: "0.9" },
  ...parentCats.map((c) => ({ loc: `${SITE}/catalogue/${c.slug}`, priority: "0.8" })),
  ...leafCats.map((c) => ({ loc: `${SITE}/catalogue/${c.slug}`, priority: "0.6" })),
  { loc: `${SITE}/blog`, priority: "0.7" },
  ...["returns", "shipping", "privacy"].map((p) => ({ loc: `${SITE}/policies/${p}`, priority: "0.5" })),
  ...products.map((p) => ({ loc: `${SITE}/product/${p.slug}`, priority: "0.9", lastmod: (p.updated_at ?? p.created_at)?.slice(0, 10) })),
  ...posts.map((b) => ({ loc: `${SITE}/blog/${b.slug}`, priority: "0.6", lastmod: b.published_at?.slice(0, 10) })),
];

await writeFile(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
      )
      .join("\n") +
    `\n</urlset>\n`,
  "utf8",
);

await writeFile(
  path.join(DIST, "robots.txt"),
  // Disallow the free-text search and sort permutations: they are unbounded URL variants that
  // canonicals collapse only AFTER each is crawled, wasting crawl budget on duplicates.
  `User-agent: *\nAllow: /\nDisallow: /*?q=\nDisallow: /*?sort=\nDisallow: /*?instock=\n\nSitemap: ${SITE}/sitemap.xml\n`,
  "utf8",
);

console.log(
  `[prerender] ${products.length} products, ${posts.length} blog posts, ${STATIC_PAGES.length} static pages, ` +
    `${categories.length} category pages, sitemap (${urls.length} urls) + robots.txt + 404.html`,
);
