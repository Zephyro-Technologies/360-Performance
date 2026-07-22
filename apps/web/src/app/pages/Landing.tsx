import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowUpRight, MessageCircle, Star } from "lucide-react";
import { Skeleton } from "@360/ui/skeleton";
import { CTA } from "../components/CTA";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { ProductCard } from "../components/ProductCard";
import { CategoryGrid } from "../components/CategoryGrid";
import { Marquee } from "../components/Marquee";
import { TrustStrip } from "../components/TrustStrip";
import { type Product, type CategoryId } from "../data/products";
import { OUR_STORY, type Testimonial, type BlogPost } from "../data/content";
import {
  getFeaturedProducts,
  getTestimonials,
  getBlogPosts,
  getProducts,
  getStockedParentSlugs,
} from "../data/api";
import { formatDate } from "@360/lib/format";
import { whatsappGeneralUrl } from "@360/lib/whatsapp";
import { useDocumentMeta } from "../lib/head";
import { imageUrl } from "@360/supabase";
import { supabase } from "../data/supabase";

// Self-hosted (apps/web/public/hero.webp), compressed from source art. Replace that file to
// change the hero backdrop. It's the LCP image, so it stays eager (no lazy loading).
const HERO_IMG = "/hero.webp";

const COLLECTION_TABS: { id: CategoryId; label: string }[] = [
  { id: "exhaust-induction", label: "Exhaust & Induction" },
  { id: "cooling-systems", label: "Cooling" },
  { id: "fuel-plumbing", label: "Fuel & Plumbing" },
  { id: "braking-suspension", label: "Braking & Suspension" },
  { id: "electronics-lighting", label: "Electronics & Lighting" },
  { id: "interior", label: "Interior" },
];

/**
 * CAR CULTURE — the owner's own drifting videos.
 *
 * Self-hosted MP4s in the PUBLIC `culture-videos` Supabase Storage bucket (migration 090097),
 * listed by hand: there is no DB table behind this yet, so adding a clip means adding an entry
 * here and redeploying.
 *
 * `src`/`poster` are BUCKET-RELATIVE paths (e.g. "drift-day-islamabad.mp4"). A full https:// URL
 * also works — imageUrl() passes absolute URLs straight through.
 *
 * A `poster` is strongly recommended: the players are preload="none", so without one the card is
 * a black box until the visitor hits play. With one, nothing but that image is downloaded up
 * front, which keeps a page full of drift clips cheap on mobile data.
 *
 * While this list is empty the entire section is skipped, so the page never shows a hollow block.
 */
type CultureVideo = { src: string; poster?: string; title: string; blurb?: string };
const CULTURE_VIDEOS: CultureVideo[] = [];

const cultureUrl = (path: string) => imageUrl(supabase, "culture-videos", path);

function SectionTitle({
  eyebrow,
  title,
  tagline,
  invert = false,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  tagline?: string;
  invert?: boolean;
  align?: "left" | "center";
}) {
  const center = align === "center";
  return (
    <div className={`mb-10 ${center ? "text-center" : ""}`}>
      {eyebrow && (
        <p
          className={`font-heading text-xs font-bold uppercase tracking-[0.4em] ${
            invert ? "text-white/60" : "text-zinc-500"
          }`}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className={`mt-2 font-heading font-bold uppercase leading-[0.95] tracking-tight ${
          invert ? "text-white" : "text-black"
        }`}
        style={{ fontSize: "clamp(1.75rem, 3.8vw, 3rem)" }}
      >
        {title}
      </h2>
      {tagline && (
        <p
          className={`mt-3 max-w-2xl font-body text-sm ${center ? "mx-auto" : ""} ${
            invert ? "text-white/60" : "text-zinc-600"
          }`}
        >
          {tagline}
        </p>
      )}
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`size-3.5 ${i < n ? "fill-brand text-brand" : "text-white/20"}`} aria-hidden />
      ))}
    </div>
  );
}

/**
 * Placeholder shaped like a real ProductCard (square image + text block). Flat h-80 blocks were
 * ~126px shorter than the cards that replaced them, so every grid jumped downward on load.
 */
function CardSkeleton({ dark = false, aspect = "aspect-square" }: { dark?: boolean; aspect?: string }) {
  const tone = dark ? "bg-white/10" : "";
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className={`${aspect} w-full ${tone}`} />
      <Skeleton className={`h-3 w-1/3 ${tone}`} />
      <Skeleton className={`h-4 w-3/4 ${tone}`} />
      <Skeleton className={`h-4 w-1/2 ${tone}`} />
    </div>
  );
}

export function Landing() {
  const [featured, setFeatured] = useState<Product[] | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null);
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryId>("exhaust-induction");
  const [collectionItems, setCollectionItems] = useState<Product[] | null>(null);
  // A failed fetch and an empty shop used to render identically, so an outage looked exactly
  // like "we have no inventory" — with nothing anywhere to say the site was broken.
  const [featuredError, setFeaturedError] = useState(false);
  const [collectionError, setCollectionError] = useState(false);
  // Parent slugs that actually have stock. null = unknown (not loaded, or the query failed),
  // in which case we fall back to offering every tab rather than hiding the section.
  const [stockedSlugs, setStockedSlugs] = useState<Set<string> | null>(null);

  useDocumentMeta();

  const loadFeatured = useCallback(() => {
    setFeatured(null);
    setFeaturedError(false);
    getFeaturedProducts()
      .then(setFeatured)
      .catch(() => {
        setFeatured([]);
        setFeaturedError(true);
      });
  }, []);

  useEffect(() => {
    loadFeatured();
    getTestimonials().then(setTestimonials).catch(() => setTestimonials([]));
    getBlogPosts(3).then(setPosts).catch(() => setPosts([]));
    getStockedParentSlugs()
      .then(setStockedSlugs)
      .catch(() => setStockedSlugs(null));
  }, [loadFeatured]);

  // Only offer collection tabs with something behind them — the hardcoded list meant most tabs
  // were dead ends that led to an equally empty catalogue page.
  const visibleTabs = useMemo(
    () => (stockedSlugs ? COLLECTION_TABS.filter((t) => stockedSlugs.has(t.id)) : COLLECTION_TABS),
    [stockedSlugs],
  );

  // Keep the selection valid when the tab list narrows.
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const loadCollection = useCallback((tab: CategoryId) => {
    setCollectionItems(null);
    setCollectionError(false);
    return getProducts({ category: tab, pageSize: 5 });
  }, []);

  // Fetch just the active collection (parent category) — not the whole catalogue.
  useEffect(() => {
    let alive = true;
    loadCollection(activeTab)
      .then((r) => alive && setCollectionItems(r.items))
      .catch(() => {
        if (!alive) return;
        setCollectionItems([]);
        setCollectionError(true);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, loadCollection]);

  return (
    <>
      {/* ──────────────────────────────────────────────────────────────
          HERO — full-viewport, centered, parts-collage backdrop
         ──────────────────────────────────────────────────────────────*/}
      {/* Subtracts the navbar AND the announcement bar (published as --announcement-h, 0 when
          hidden), so the hero fills exactly one fold whether or not one is live. */}
      <section className="relative isolate flex min-h-[calc(100svh-4rem-var(--announcement-h,0px))] flex-col overflow-hidden bg-black text-white">
        <ImageWithFallback
          src={HERO_IMG}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-55"
        />
        {/* layered overlays for legibility + cinematic vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />

        {/* corner ticker */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 hidden items-center gap-2 font-heading text-[10px] font-bold uppercase tracking-[0.4em] text-white/50 sm:flex sm:left-6 lg:left-8">
          <span className="size-1.5 rounded-full bg-brand" /> Est. 2018 · Islamabad
        </div>

        {/* center content */}
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-brand" />
            <span className="font-heading text-[11px] font-bold uppercase tracking-[0.45em] text-white/80">
              360 Performance
            </span>
            <span className="h-px w-8 bg-brand" />
          </div>
          <h1
            className="mt-6 font-heading font-bold uppercase leading-[1.05] tracking-tight text-white"
            style={{ fontSize: "clamp(2rem, 5.5vw, 4.25rem)" }}
          >
            {/* The {" "} is load-bearing: <br> is not whitespace, so without it the
                accessible name and the text search engines index read
                "Pakistan's TrustedMotorsports Store". */}
            Pakistan's Trusted{" "}
            <br />
            Motorsports Store
          </h1>
          <p className="mt-5 max-w-xl font-body text-sm text-white/75 sm:text-base">
            Exhausts, turbos, cooling and more — genuine performance parts, hand-picked
            and shipped nationwide.
          </p>
          {/* Grid, not flex-wrap: two content-sized buttons came out visibly uneven
              (one wider than the other). Equal columns make them match. */}
          <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <CTA to="/catalogue" size="md" tone="dark" className="w-full">
              Browse Parts <ArrowRight className="size-4" />
            </CTA>
            <CTA href={whatsappGeneralUrl()} variant="outline" tone="dark" size="md" className="w-full">
              <MessageCircle className="size-4" /> Talk To Us
            </CTA>
          </div>
          {/* Set the (cartless) ordering model in the first viewport — "Shop" implies a checkout
              this store doesn't have, which is a common source of bounce. */}
          <p className="mt-5 font-body text-xs text-white/55">
            No cart, no checkout — order in one message on WhatsApp.
          </p>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          TRUST STRIP — the buying reassurances (incl. payment) right at the fold
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <TrustStrip />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          PERFORMANCE — category grid (light, magazine, grayscale tiles)
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="Browse"
            title="Shop by Category"
            tagline="Genuine performance parts for every corner of your build."
            invert
          />
          <CategoryGrid />
        </div>
      </section>

      {/* MARQUEE — dark band */}
      <Marquee
        tone="dark"
        items={[
          "360 Performance",
          "Premium Performance Parts",
          "Shipped Across Pakistan",
          "Genuine · Hand-Picked",
        ]}
      />

      {/* ──────────────────────────────────────────────────────────────
          FEATURED PRODUCTS — dark band, 4-up
         ──────────────────────────────────────────────────────────────*/}
      {/* Skipped entirely when there is nothing to feature: a heading over an empty black band
          reads as a broken page. Still rendered on error, so an outage stays visible instead of
          being indistinguishable from an empty shop. */}
      {(featured === null || featuredError || featured.length > 0) && (
        <section className="bg-black text-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <SectionTitle
              eyebrow="Hand-Picked"
              title="Featured Products"
              invert
            />
            {featuredError ? (
              <div className="border border-dashed border-white/25 px-6 py-14 text-center">
                <p className="font-body text-sm text-white/70">
                  Couldn't load featured products just now.
                </p>
                <button
                  type="button"
                  onClick={loadFeatured}
                  className="mt-4 inline-flex items-center gap-2 border border-white/40 px-5 py-2.5 font-heading text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:bg-white hover:text-black"
                >
                  Retry
                </button>
              </div>
            ) : (
              /* With fewer than four, a fixed 4-column grid pins them left and leaves half the
                 row empty, which reads as "the rest failed to load". Centre them instead. */
              <div
                className={
                  featured && featured.length < 4
                    ? "grid justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,300px))]"
                    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                }
              >
                {featured
                  ? featured.slice(0, 4).map((p) => (
                      <ProductCard key={p.id} product={p} tone="dark" />
                    ))
                  : Array.from({ length: 4 }).map((_, i) => (
                      <CardSkeleton key={i} dark />
                    ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          FEATURED COLLECTIONS — light, tabbed
         ──────────────────────────────────────────────────────────────*/}
      {/* Skipped when no parent category has stock at all. */}
      {visibleTabs.length > 0 && (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle eyebrow="Curated" title="Featured Collections" />

          {/* tab strip */}
          <div className="-mx-4 mb-8 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {visibleTabs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  aria-pressed={active}
                  className={`whitespace-nowrap border-b-2 px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    active
                      ? "border-brand text-black"
                      : "border-transparent text-zinc-500 hover:text-black"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {collectionError ? (
            <p className="py-12 text-center font-body text-sm text-zinc-500">
              Couldn't load this collection just now — please refresh.
            </p>
          ) : collectionItems === null ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : collectionItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {collectionItems.map((p) => (
                <ProductCard key={p.id} product={p} tone="light" />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center font-body text-sm text-zinc-500">
              No products in this collection yet.
            </p>
          )}

          <div className="mt-10 flex justify-center">
            <CTA to={`/catalogue/${activeTab}`} variant="outline" tone="light" size="md">
              View {visibleTabs.find((t) => t.id === activeTab)?.label}
              <ArrowUpRight className="size-4" />
            </CTA>
          </div>
        </div>
      </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          TESTIMONIALS — honest text reviews (rating + name + city), on black.
          Previously these were Unsplash stock portraits badged "Build 01" under a
          "Watch What People Say" heading, implying videos that don't exist and passing
          strangers off as customer builds. The DB already carries rating + location.
         ──────────────────────────────────────────────────────────────*/}
      {(testimonials === null || testimonials.length > 0) && (
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="Testimonials"
            title="What Our Customers Say"
            tagline="Real reviews from builders across Pakistan."
            invert
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {testimonials
              ? testimonials.slice(0, 4).map((t) => (
                  <figure
                    key={t.id}
                    className="flex h-full flex-col justify-between gap-4 border border-white/10 bg-zinc-950 p-6"
                  >
                    <div>
                      <Stars rating={t.rating} />
                      <blockquote className="mt-4 font-body text-sm leading-6 text-white/85">
                        “{t.quote}”
                      </blockquote>
                    </div>
                    <figcaption className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-white">
                      {t.name.replace(/\.$/, "")}
                      {t.location && (
                        <span className="mt-0.5 block font-body text-[11px] font-normal normal-case tracking-normal text-white/50">
                          {t.location}
                        </span>
                      )}
                    </figcaption>
                  </figure>
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 w-full bg-white/10" />
                ))}
          </div>
        </div>
      </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          BLOG PREVIEW — clean, light, three centered cards
         ──────────────────────────────────────────────────────────────*/}
      {/* Skipped when there are no posts. Previously this rendered the eyebrow, heading and a
          "View All" button over an empty grid — ~200px of void leading to an empty page. */}
      {(posts === null || posts.length > 0) && (
      <section id="blog" className="scroll-mt-24 bg-white">
        {/* max-w-7xl to match every other section — at 6xl this band was inset 64px per side,
            so its left edge did not line up with the grids above it. */}
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="From The Garage"
            title="Blog Posts"
            align="center"
          />
          <div className="mt-2 flex justify-center">
            <CTA to="/blog" variant="outline" tone="light" size="sm">
              View All
            </CTA>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts
              ? posts.map((post) => (
                  <Link
                    key={post.id}
                    to={`/blog/${post.slug}`}
                    className="group flex flex-col"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-zinc-100">
                      <ImageWithFallback
                        src={post.image}
                        alt={post.title}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex flex-1 flex-col pt-5">
                      <time className="font-body text-xs uppercase tracking-[0.2em] text-zinc-500">
                        {formatDate(post.date)}
                      </time>
                      <h3 className="mt-2 font-heading text-base font-bold uppercase leading-snug tracking-wide text-black transition-colors group-hover:text-brand">
                        {post.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 font-body text-sm text-zinc-600">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                ))
              : Array.from({ length: 3 }).map((_, i) => (
                  <CardSkeleton key={i} aspect="aspect-[4/3]" />
                ))}
          </div>
        </div>
      </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          CAR CULTURE — the owner's own drifting videos, on black between the
          white News and Our Story sections so the page keeps alternating.
          Skipped entirely while CULTURE_VIDEOS is empty.
         ──────────────────────────────────────────────────────────────*/}
      {CULTURE_VIDEOS.length > 0 && (
        <section id="car-culture" className="scroll-mt-24 bg-black text-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <SectionTitle
              eyebrow="Car Culture"
              title="From The Driver's Seat"
              tagline="Drift days, builds and behind-the-scenes — shot on our own runs."
              invert
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CULTURE_VIDEOS.map((v) => (
                <figure
                  key={v.src}
                  className="group relative isolate overflow-hidden border border-white/10 bg-zinc-950 transition-colors duration-300 hover:border-brand/40 motion-reduce:transition-none"
                >
                  {/* preload="none": only the poster is fetched until the visitor presses play. */}
                  <video
                    className="aspect-video w-full bg-black object-cover"
                    src={cultureUrl(v.src)}
                    poster={v.poster ? cultureUrl(v.poster) : undefined}
                    preload="none"
                    controls
                    playsInline
                    aria-label={v.title}
                  />
                  <figcaption className="p-4">
                    <h3 className="font-heading text-base font-bold uppercase leading-tight tracking-tight text-white">
                      {v.title}
                    </h3>
                    <span aria-hidden className="mt-2 block h-0.5 w-10 bg-brand" />
                    {v.blurb && (
                      <p className="mt-3 font-body text-sm leading-6 text-white/70">{v.blurb}</p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          OUR STORY — short, centered, simple
         ──────────────────────────────────────────────────────────────*/}
      <section id="our-story" className="scroll-mt-24 bg-white">
        {/* py, not pb: with no top padding this section merged into the white band above it and
            its heading got half the leading whitespace of every other section. */}
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <h2
            className="font-heading font-bold uppercase leading-none tracking-tight text-black"
            style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
          >
            Our Story
          </h2>
          <div className="mx-auto mt-5 max-w-2xl space-y-4 font-body text-sm leading-7 text-zinc-600 sm:text-base">
            {OUR_STORY.body.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {/* tiny visual anchor */}
          <div className="mx-auto mt-10 flex max-w-2xl gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 ${i === 3 ? "bg-brand" : "bg-zinc-200"}`}
              />
            ))}
          </div>
          <p className="mt-6 font-heading text-xs font-bold uppercase tracking-[0.35em] text-zinc-500">
            Genuine Parts · Shipped Nationwide · Built In Pakistan
          </p>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          CLOSING CTA — the page used to end on prose and never ask for the order.
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.4em] text-brand">
            Ready When You Are
          </p>
          <h2
            className="mt-3 font-heading font-bold uppercase leading-none tracking-tight text-white"
            style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
          >
            Order In One Message
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-body text-sm text-white/70 sm:text-base">
            No cart, no account. Send us the part and a real person confirms price, fitment and
            delivery on WhatsApp.
          </p>
          {/* Wider than the hero pair (max-w-md) and nowrap: "Order on WhatsApp" is a long label
              that wrapped to two lines once the columns were split evenly. */}
          <div className="mx-auto mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
            <CTA href={whatsappGeneralUrl()} variant="primary" tone="dark" size="md" className="w-full whitespace-nowrap">
              <MessageCircle className="size-4" /> Order on WhatsApp
            </CTA>
            <CTA to="/catalogue" variant="outline" tone="dark" size="md" className="w-full whitespace-nowrap">
              Browse Parts
            </CTA>
          </div>
        </div>
      </section>
    </>
  );
}
