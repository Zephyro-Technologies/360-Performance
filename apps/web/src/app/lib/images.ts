// Responsive srcset builder for product/blog images.
// - Unsplash URLs support ?w=<width> → works everywhere.
// - Supabase Storage public object URLs are rewritten to the render/image endpoint
//   with ?width=<width> (requires the Storage image-transform add-on; the plain
//   <img src> remains the universal fallback when transforms aren't enabled).
// - Anything else → no srcset (the single src is used).
const DEFAULT_WIDTHS = [320, 640, 960, 1280];

function withParam(url: string, key: string, value: string): string {
  const [base, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export function srcSetFor(url: string | undefined, widths: number[] = DEFAULT_WIDTHS): string | undefined {
  if (!url) return undefined;
  if (url.includes("images.unsplash.com")) {
    return widths.map((w) => `${withParam(url, "w", String(w))} ${w}w`).join(", ");
  }
  const render = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  if (render !== url) {
    return widths.map((w) => `${withParam(render, "width", String(w))} ${w}w`).join(", ");
  }
  return undefined;
}
