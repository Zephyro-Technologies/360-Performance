import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { absoluteUrl, siteOrigin } from "../lib/site";
import { breadcrumbJsonLd } from "../lib/jsonld";
import { JsonLd } from "./JsonLd";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  // BreadcrumbList so a search result shows Home › Catalogue › Cooling instead of a bare URL.
  // The last crumb is the current page (no `to`); resolve it to the canonical current URL.
  const ld = breadcrumbJsonLd(
    items.map((it) => ({
      name: it.label,
      url: it.to
        ? absoluteUrl(it.to)
        : `${siteOrigin()}${typeof window !== "undefined" ? window.location.pathname : ""}`,
    })),
  );
  return (
    <nav aria-label="Breadcrumb" className="font-body text-sm">
      <JsonLd data={ld} />
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="text-muted-foreground transition-colors hover:text-brand"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={last ? "font-medium text-foreground" : "text-muted-foreground"}
                  aria-current={last ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight className="size-3.5 text-muted-foreground" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
