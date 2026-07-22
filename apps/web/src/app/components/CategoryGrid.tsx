import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { getCategories } from "../data/api";
import type { Category } from "../data/products";

// The DB categories carry no art — map the fixed parent slugs to showcase imagery.
const PARENT_META: Record<string, { image: string; tagline: string }> = {
  "exhaust-induction": { image: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=800&q=80", tagline: "Downpipes, exhausts & intakes" },
  "cooling-systems": { image: "https://images.unsplash.com/photo-1518987048-93e29699e79a?auto=format&fit=crop&w=800&q=80", tagline: "Radiators & intercoolers" },
  "fuel-plumbing": { image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=800&q=80", tagline: "Fueling, AN pipe & fittings" },
  "braking-suspension": { image: "https://images.unsplash.com/photo-1600661653561-629509216228?auto=format&fit=crop&w=800&q=80", tagline: "Brake pads & suspension" },
  "electronics-lighting": { image: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=800&q=80", tagline: "Gauges, lighting & ignition" },
  interior: { image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80", tagline: "Seats & carbon trim" },
  exterior: { image: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80", tagline: "Body kits & exterior" },
  "misc-performance": { image: "https://images.unsplash.com/photo-1530046339160-ce3e530c7d2f?auto=format&fit=crop&w=800&q=80", tagline: "Performance extras" },
};
const FALLBACK_IMG = "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80";

function Tile({ category }: { category: Category }) {
  const meta = PARENT_META[category.slug];
  return (
    <Link
      to={`/catalogue/${category.slug}`}
      className="group relative isolate flex h-72 flex-col justify-end transform-gpu bg-zinc-950 ring-1 ring-white/5 transition-all duration-500 [backface-visibility:hidden] hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(204,0,0,0.55)] hover:ring-brand/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Clip layer, kept separate from the element that lifts on hover. On fractional-DPR
          displays (Windows scaling) the -translate-y lift landed the clipped bright image edge on
          a sub-pixel row, and Blink anti-aliased it into a faint light line along the bottom. Two
          guards: (1) transform-gpu on both the Link and the image keeps them on stable GPU layers
          so the lift composites cleanly; (2) the gradient is solid black across the bottom band
          (from-25%), so even if a seam slipped through it is black-on-black and cannot show. */}
      <div className="absolute inset-0 overflow-hidden">
        <ImageWithFallback
          src={meta?.image ?? FALLBACK_IMG}
          alt={category.name}
          loading="lazy"
          decoding="async"
          width={800}
          height={576}
          className="pointer-events-none absolute inset-0 size-full transform-gpu object-cover opacity-90 saturate-[0.85] transition-all duration-700 ease-out [backface-visibility:hidden] group-hover:scale-105 group-hover:opacity-100 group-hover:saturate-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black from-25% via-black/70 to-transparent" />
      </div>
      <span aria-hidden className="absolute right-0 top-0 z-10 flex size-11 items-center justify-center bg-brand text-white transition-all duration-300 group-hover:size-12 motion-reduce:transition-none">
        <ArrowUpRight className="size-5" />
      </span>
      <div className="relative z-10 p-5">
        <h3 className="font-heading font-bold uppercase leading-[0.95] tracking-tight text-white" style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}>
          {category.name}
        </h3>
        <span aria-hidden className="mt-3 block h-0.5 w-2/5 bg-brand transition-all duration-500 group-hover:w-full motion-reduce:transition-none" />
        {meta?.tagline && <p className="mt-3 font-body text-sm text-white/70">{meta.tagline}</p>}
      </div>
    </Link>
  );
}

export function CategoryGrid() {
  const [parents, setParents] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getCategories()
      .then((cats) => {
        if (alive) setParents(cats.filter((c) => c.parentId === null));
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="py-10 text-center font-body text-sm text-muted-foreground">Couldn't load categories. Please refresh.</p>;
  }
  if (!parents) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-72 animate-pulse bg-zinc-900 motion-reduce:animate-none" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {parents.map((c) => <Tile key={c.id} category={c} />)}
    </div>
  );
}
