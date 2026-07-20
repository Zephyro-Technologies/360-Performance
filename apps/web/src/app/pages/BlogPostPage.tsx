import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowUpRight, MessageCircle } from "lucide-react";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Skeleton } from "@360/ui/skeleton";
import { Button } from "@360/ui/button";
import { Markdown } from "@360/ui/Markdown";
import { getBlogPostBySlug, getBlogPosts } from "../data/api";
import { type BlogPost } from "../data/content";
import { formatDate } from "@360/lib/format";
import { whatsappBlogUrl } from "@360/lib/whatsapp";
import { useDocumentMeta } from "../lib/head";

export function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState<BlogPost | null | undefined>(undefined);
  const [more, setMore] = useState<BlogPost[]>([]);

  useEffect(() => {
    if (!slug) return;
    setPost(undefined);
    getBlogPostBySlug(slug).then((p) => setPost(p ?? null)).catch(() => setPost(null));
    getBlogPosts()
      .then((all) => setMore(all.filter((p) => p.slug !== slug).slice(0, 3)))
      .catch(() => setMore([]));
  }, [slug]);

  useDocumentMeta(post?.title, post?.excerpt);

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-6 h-10 w-3/4" />
        <Skeleton className="mt-4 h-64 w-full" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    );
  }

  if (post === null) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center">
        <h1>Post Not Found</h1>
        <p className="font-body text-muted-foreground">
          That article doesn't exist or hasn't been published yet.
        </p>
        <Button asChild className="bg-brand text-brand-foreground hover:bg-brand-hover">
          <Link to="/blog">Back to News</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Home", to: "/" },
            { label: "News", to: "/blog" },
            { label: post.title },
          ]}
        />
      </div>

      {/* Header */}
      <header className="mx-auto max-w-3xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 font-heading text-[11px] font-bold uppercase tracking-[0.35em] text-zinc-500">
          <time>{formatDate(post.date)}</time>
          {post.readMinutes && (
            <>
              <span className="h-px w-6 bg-brand" />
              <span>{post.readMinutes} min read</span>
            </>
          )}
        </div>
        <h1
          className="mt-4 font-heading font-bold uppercase leading-[1.02] tracking-tight text-black"
          style={{ fontSize: "clamp(1.875rem, 4.5vw, 3.25rem)" }}
        >
          {post.title}
        </h1>
        {post.author && (
          <p className="mt-4 font-body text-sm text-zinc-600">
            By <span className="font-bold text-black">{post.author}</span> · 360 Performance
          </p>
        )}
      </header>

      {/* Hero image */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="aspect-[16/9] overflow-hidden bg-zinc-100">
          <ImageWithFallback
            src={post.image}
            alt={post.title}
            className="size-full object-cover"
          />
        </div>
      </div>

      {/* Body */}
      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-body text-lg leading-8 text-black">{post.excerpt}</p>
        {post.bodyMd && (
          <div className="mt-8 font-body text-base leading-8 text-zinc-700">
            <Markdown>{post.bodyMd}</Markdown>
          </div>
        )}

        {/* CTA card */}
        <aside className="mt-12 flex flex-col gap-3 border border-zinc-200 bg-zinc-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.3em] text-zinc-500">
              Need help speccing your build?
            </p>
            <p className="mt-1 font-body text-sm text-black">
              Message us — we'll talk you through fitment, lead times and dispatch.
            </p>
          </div>
          <a
            href={whatsappBlogUrl(post.title)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-brand px-6 py-3 font-heading text-xs font-bold uppercase tracking-[0.3em] text-white transition-colors hover:bg-brand-hover"
          >
            <MessageCircle className="size-4" /> Ask About This Build
          </a>
        </aside>

        <div className="mt-10">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.3em] text-zinc-600 transition-colors hover:text-black"
          >
            <ArrowLeft className="size-4" /> All News
          </Link>
        </div>
      </article>

      {/* More posts */}
      {more.length > 0 && (
        <section className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 flex items-end justify-between gap-4">
              <h2
                className="font-heading font-bold uppercase leading-none tracking-tight text-black"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)" }}
              >
                More From The Garage
              </h2>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-[0.3em] text-black"
              >
                View all <ArrowUpRight className="size-4 text-brand" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((p) => (
                <Link key={p.id} to={`/blog/${p.slug}`} className="group flex flex-col">
                  <div className="aspect-[4/3] overflow-hidden bg-zinc-100">
                    <ImageWithFallback
                      src={p.image}
                      alt={p.title}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  </div>
                  <time className="mt-4 font-body text-xs uppercase tracking-[0.25em] text-zinc-500">
                    {formatDate(p.date)}
                  </time>
                  <h3 className="mt-2 font-heading text-base font-bold uppercase leading-snug tracking-wide text-black transition-colors group-hover:text-brand">
                    {p.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
