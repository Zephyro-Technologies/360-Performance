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
// Degrades safely: with no Supabase env (e.g. a local `pnpm build`), it logs and skips.
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

function bail(msg) {
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
function render(shell, { title, description, url, image, jsonLd, robots }) {
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
  if (robots) set(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${esc(robots)}" />`);

  const extra =
    `\n    <link rel="canonical" href="${esc(url)}" />` +
    (jsonLd ? `\n    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : "");
  return html.replace("</head>", `${extra}\n  </head>`);
}

async function emit(route, html) {
  const dir = path.join(DIST, route);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");
}

const shell = await readFile(path.join(DIST, "index.html"), "utf8");

// ---- products -----------------------------------------------------------------------------
const products = await q(
  "products_public",
  "select=slug,name,brand,sku,mpn,price_pkr,sale_price_pkr,images,short_description,meta_description,availability,created_at",
);

const AVAIL = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
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
          availability: AVAIL[p.availability] ?? "https://schema.org/InStock",
        },
      },
    }),
  );
}

// ---- blog ---------------------------------------------------------------------------------
const posts = await q("blog_posts", "select=slug,title,excerpt,hero_image,published_at&published=eq.true");

for (const b of posts) {
  const url = `${SITE}/blog/${b.slug}`;
  const image = publicImage("blog-images", b.hero_image) || `${SITE}/og-card.png`;
  const description = b.excerpt || `${b.title} — from the ${BRAND} garage.`;
  const html = render(shell, { title: `${b.title} | ${BRAND}`, description, url, image }).replace(
    '<meta property="og:type" content="website" />',
    '<meta property="og:type" content="article" />',
  );
  await emit(`blog/${b.slug}`, html);
}

// ---- sitemap + robots ---------------------------------------------------------------------
const staticRoutes = ["", "/catalogue", "/blog", "/policies/returns", "/policies/shipping", "/policies/privacy"];
const urls = [
  ...staticRoutes.map((r) => ({ loc: `${SITE}${r || "/"}`, priority: r === "" ? "1.0" : "0.7" })),
  ...products.map((p) => ({ loc: `${SITE}/product/${p.slug}`, priority: "0.9" })),
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
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
  "utf8",
);

console.log(
  `[prerender] ${products.length} products, ${posts.length} blog posts, sitemap (${urls.length} urls) + robots.txt`,
);
