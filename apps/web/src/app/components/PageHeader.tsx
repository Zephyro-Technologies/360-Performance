import type { ReactNode } from "react";

/**
 * Shared page header used on inner routes (Catalogue, Blog, Product Detail,
 * Policy, 404) so they share the same type rhythm as the Landing sections.
 */
export function PageHeader({
  eyebrow,
  title,
  tagline,
  action,
}: {
  eyebrow?: string;
  title: string;
  tagline?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="font-heading text-xs font-bold uppercase tracking-[0.4em] text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h1
          className="mt-2 font-heading font-bold uppercase leading-[0.95] tracking-tight text-black"
          style={{ fontSize: "clamp(1.875rem, 4.5vw, 3.25rem)" }}
        >
          {title}
        </h1>
        <div className="mt-4 h-1 w-12 bg-brand" aria-hidden />
        {tagline && (
          <p className="mt-4 max-w-2xl font-body text-sm text-zinc-600 sm:text-base">
            {tagline}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
