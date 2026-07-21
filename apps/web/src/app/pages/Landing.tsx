import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowUpRight, MessageCircle } from "lucide-react";
import { Button } from "@360/ui/button";
import { Skeleton } from "@360/ui/skeleton";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { ProductCard } from "../components/ProductCard";
import { CategoryGrid } from "../components/CategoryGrid";
import { Marquee } from "../components/Marquee";
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

const HERO_IMG =
  "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=1920&q=80";

const REEL_PORTRAITS = [
  "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=600&q=80",
];

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
      <section className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden bg-black text-white">
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
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              className="h-12 rounded-sm bg-brand px-8 font-heading text-sm font-bold uppercase tracking-[0.2em] text-white hover:bg-brand-hover"
            >
              <Link to="/catalogue">
                Shop Now <ArrowRight className="size-4" />
              </Link>
            </Button>
            <a
              href={whatsappGeneralUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-sm border border-white/30 bg-transparent px-8 font-heading text-sm font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-white hover:text-black"
            >
              <MessageCircle className="size-4" /> Talk To Us
            </a>
          </div>
        </div>

        {/* bottom bar — quick stats */}
        <div className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="mx-auto grid max-w-7xl grid-cols-2 items-center gap-4 px-4 py-4 sm:grid-cols-3 sm:px-6 lg:px-8">
            {[
              { k: "500+", v: "Builds Supplied" },
              { k: "100%", v: "Genuine Parts" },
              { k: "PK", v: "Nationwide Delivery" },
            ].map((s) => (
              <div key={s.v} className="flex items-baseline gap-2">
                <span className="font-heading text-lg font-bold leading-none text-white">
                  {s.k}
                </span>
                <span className="font-heading text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">
                  {s.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          BRAND INTRO — short centered narrative on white
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
          <h2
            className="font-heading font-bold uppercase leading-none tracking-tight text-black"
            style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
          >
            360 Performance
          </h2>
          <p className="mx-auto mt-5 max-w-2xl font-body text-sm leading-7 text-zinc-600 sm:text-base">
            Built in a single Islamabad garage with one obsession — helping Pakistan's
            car enthusiasts build machines that actually perform. We stock genuine,
            hand-picked motorsports parts and ship them to driveways and workshops
            across the country. We don't run a marketplace; we run a build shop.
          </p>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          PERFORMANCE — category grid (light, magazine, grayscale tiles)
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="360 Performance"
            title="Performance"
            tagline="Relied on by Pakistan's most influential motorsport experts."
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
          "Order On WhatsApp",
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
                      <Skeleton key={i} className="h-80 w-full bg-white/10" />
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
                  className={`whitespace-nowrap border-b-2 px-4 py-2.5 font-heading text-sm font-bold uppercase tracking-[0.15em] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
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
                <Skeleton key={i} className="h-80 w-full" />
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
            <Link
              to={`/catalogue?category=${activeTab}`}
              className="inline-flex items-center gap-2 border border-black px-7 py-3 font-heading text-xs font-bold uppercase tracking-[0.25em] text-black transition-colors hover:bg-black hover:text-white"
            >
              View {visibleTabs.find((t) => t.id === activeTab)?.label}
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* ──────────────────────────────────────────────────────────────
          TESTIMONIALS — reel-style tall cards on black
         ──────────────────────────────────────────────────────────────*/}
      <section className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="Testimonials"
            title="Watch What People Say"
            tagline="Real builds, real owners, real reviews from across Pakistan."
            invert
          />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {testimonials
              ? testimonials.map((t, i) => (
                  <figure
                    key={t.id}
                    className="group relative isolate flex aspect-[9/16] flex-col justify-end overflow-hidden border border-white/10 bg-zinc-950"
                  >
                    <ImageWithFallback
                      src={REEL_PORTRAITS[i % REEL_PORTRAITS.length]}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 bg-black/60 px-2 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.3em] text-white backdrop-blur">
                      Build {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="relative z-10 p-4">
                      <p className="font-heading text-[10px] font-bold uppercase tracking-[0.4em] text-brand">
                        360 Performance
                      </p>
                      <figcaption className="mt-1 font-heading text-xl font-bold uppercase leading-none tracking-tight text-white sm:text-2xl">
                        {t.name.replace(/\.$/, "")}
                      </figcaption>
                      <p className="mt-2 line-clamp-2 font-body text-xs text-white/75">
                        {t.quote}
                      </p>
                    </div>
                  </figure>
                ))
              : Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[9/16] w-full bg-white/10" />
                ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          BLOG PREVIEW — clean, light, three centered cards
         ──────────────────────────────────────────────────────────────*/}
      {/* Skipped when there are no posts. Previously this rendered the eyebrow, heading and a
          "View All" button over an empty grid — ~200px of void leading to an empty page. */}
      {(posts === null || posts.length > 0) && (
      <section id="blog" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <SectionTitle
            eyebrow="From The Garage"
            title="Blog Posts"
            align="center"
          />
          <div className="mt-2 flex justify-center">
            <Link
              to="/blog"
              className="border border-zinc-300 px-5 py-2 font-heading text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-700 transition-colors hover:border-black hover:text-black"
            >
              View All
            </Link>
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
                  <Skeleton key={i} className="h-64 w-full" />
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
        <div className="mx-auto max-w-3xl px-4 pb-20 text-center sm:px-6 lg:px-8">
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
            Performance Parts · 1 Brand · Built In Pakistan
          </p>
        </div>
      </section>
    </>
  );
}
