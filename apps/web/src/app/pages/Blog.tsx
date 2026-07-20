import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "@360/ui/skeleton";
import { getBlogPosts } from "../data/api";
import { type BlogPost } from "../data/content";
import { formatDate } from "@360/lib/format";
import { useDocumentMeta } from "../lib/head";

export function Blog() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState(false);

  useDocumentMeta("News");

  useEffect(() => {
    getBlogPosts().then(setPosts).catch(() => setError(true));
  }, []);

  const [featured, ...rest] = posts ?? [];

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "News" }]} />
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="From The Garage"
          title="News & Build Notes"
          tagline="Straight talk on parts, builds and the Pakistani motorsports scene — written by the people answering the phone."
        />
      </div>

      {/* Featured + grid */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        {error ? (
          <div className="border border-dashed border-zinc-300 px-6 py-20 text-center">
            <p className="font-heading text-xl uppercase tracking-tight text-black">Couldn't load posts</p>
            <p className="mt-2 font-body text-sm text-zinc-600">Something went wrong. Please refresh to try again.</p>
          </div>
        ) : posts === null ? (
          <div className="grid gap-8 lg:grid-cols-3">
            <Skeleton className="aspect-[4/3] w-full lg:col-span-2" />
            <Skeleton className="aspect-[4/3] w-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="border border-dashed border-zinc-300 px-6 py-20 text-center">
            <p className="font-heading text-xl uppercase tracking-tight text-black">
              No posts yet
            </p>
            <p className="mt-2 font-body text-sm text-zinc-600">
              The admin dashboard is being wired up — new posts will land here soon.
            </p>
          </div>
        ) : (
          <>
            {/* hero post */}
            {featured && (
              <Link
                to={`/blog/${featured.slug}`}
                className="group grid gap-6 border-y border-zinc-200 py-10 lg:grid-cols-[1.4fr_1fr] lg:gap-10"
              >
                <div className="aspect-[16/10] overflow-hidden bg-zinc-100">
                  <ImageWithFallback
                    src={featured.image}
                    alt={featured.title}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-3 font-heading text-[11px] font-bold uppercase tracking-[0.35em] text-zinc-500">
                    <span>Featured</span>
                    <span className="h-px w-6 bg-brand" />
                    <time>{formatDate(featured.date)}</time>
                  </div>
                  <h2
                    className="mt-4 font-heading font-bold uppercase leading-[1.02] tracking-tight text-black transition-colors group-hover:text-brand"
                    style={{ fontSize: "clamp(1.5rem, 3vw, 2.5rem)" }}
                  >
                    {featured.title}
                  </h2>
                  <p className="mt-4 font-body text-sm leading-7 text-zinc-600 sm:text-base">
                    {featured.excerpt}
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.3em] text-black">
                    Read article <ArrowUpRight className="size-4 text-brand" />
                  </div>
                </div>
              </Link>
            )}

            {/* rest */}
            {rest.length > 0 && (
              <div className="grid grid-cols-1 gap-8 pt-10 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
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
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                      />
                    </div>
                    <div className="flex flex-1 flex-col pt-4">
                      <time className="font-body text-xs uppercase tracking-[0.25em] text-zinc-500">
                        {formatDate(post.date)}
                        {post.readMinutes ? ` · ${post.readMinutes} min read` : ""}
                      </time>
                      <h3 className="mt-2 font-heading text-base font-bold uppercase leading-snug tracking-wide text-black transition-colors group-hover:text-brand">
                        {post.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 font-body text-sm text-zinc-600">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
