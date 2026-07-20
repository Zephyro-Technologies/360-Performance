// Derives the app brand assets from the single source logo (360_performance_logo.svg).
// - logo.svg            : the full wordmark, white text + red slash, for DARK backgrounds
//                         (storefront navbar/footer/sheet, admin sidebar, login brand panel).
// - logo-dark.svg       : the same lockup for LIGHT backgrounds (the white mobile login
//                         panel). ONLY the "PERFORMANCE" wordmark goes near-black; the red
//                         "360" box (polygon) + white "360" glyphs stay byte-identical to
//                         logo.svg — that lockup never changes, regardless of background.
// - favicon.svg         : a square tab icon. The full wordmark is illegible shrunk, so the
//                         icon uses only the recognisable "360" + red slash on a black
//                         rounded square, centred.
// Run: node scripts/assets/generate-brand-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const SRC = "360_performance_logo.svg";
const svg = readFileSync(SRC, "utf8");

// The red slash (parallelogram) and the first white <path> (the "360" glyph cluster).
// The second white path is "PERFORMANCE" — deliberately dropped from the favicon.
const polygon = svg.match(/<polygon[^>]*\/>/)[0];
const threeSixtyZero = svg.match(/<path\b[^>]*fill="#ffffff"[^>]*\/>/)[0];

// Source content bbox ~ x[0,427] y[0,244]; centre (213.8, 122). Frame in a 480 square
// with even padding, black rounded background.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-26 -118 480 480" role="img" aria-label="360 Performance">
  <rect x="-26" y="-118" width="480" height="480" rx="76" fill="#0a0a0a"/>
  ${polygon}
  ${threeSixtyZero}
</svg>
`;

// Recolour ONLY the "PERFORMANCE" wordmark (the 2nd white <path>) to near-black. The red
// "360" box (<polygon fill="#ff171a">) and the white "360" glyphs (the 1st white <path>)
// are left untouched, so they stay byte-identical to logo.svg. (Recolouring every #ffffff
// — the old behaviour — wrongly darkened the "360" glyphs and broke the fixed lockup.)
let whitePathSeen = 0;
const darkLogo = svg.replace(/<path\b[^>]*?fill="#ffffff"[^>]*?\/>/gi, (pathEl) => {
  whitePathSeen += 1;
  return whitePathSeen === 1 ? pathEl : pathEl.replace('fill="#ffffff"', 'fill="#0a0a0a"');
});

for (const dir of ["apps/web/public", "apps/admin/public"]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/logo.svg`, svg);
  writeFileSync(`${dir}/favicon.svg`, favicon);
}
writeFileSync("apps/admin/public/logo-dark.svg", darkLogo);

console.log("brand assets written: logo.svg + favicon.svg (both apps), logo-dark.svg (admin)");

// Social share card (storefront only): the white logo centred on black with a red
// accent, rasterised to a 1200x630 PNG (the size WhatsApp/Facebook/Twitter expect).
// The logo is baked paths (no fonts), so SVG->PNG rasterisation is deterministic.
const logoInner = svg
  .replace(/<\?xml[\s\S]*?\?>/, "")
  .replace(/<svg[\s\S]*?>/, "")
  .replace(/<\/svg>/, "")
  .trim();
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(240, 250) scale(0.45)">${logoInner}</g>
  <rect x="500" y="392" width="200" height="6" rx="3" fill="#ff171a"/>
</svg>`;
await sharp(Buffer.from(ogSvg)).png().toFile("apps/web/public/og-card.png");
console.log("og-card.png written (1200x630)");
