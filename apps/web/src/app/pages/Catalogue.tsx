import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { SlidersHorizontal, X, ChevronLeft, ChevronRight, PackageX } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@360/ui/select";
import { Checkbox } from "@360/ui/checkbox";
import { Button } from "@360/ui/button";
import { Skeleton } from "@360/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@360/ui/sheet";
import { ProductCard } from "../components/ProductCard";
import { SearchBar } from "../components/SearchBar";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";
import { CategoryNav } from "../components/CategoryNav";
import { type Category, type Product } from "../data/products";
import {
  getCategories,
  getProducts,
  type SortOption,
  type CatalogueResult,
} from "../data/api";
import { buildPageList } from "../lib/pagination";
import { useDocumentMeta } from "../lib/head";

const PAGE_SIZE = 9;
const SORT_LABELS: Record<SortOption, string> = {
  newest: "Newest",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  name: "Name: A–Z",
};

export function Catalogue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let alive = true;
    getCategories().then((c) => alive && setCategories(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Parent groups for the sidebar (parent + its leaves; standalone leaves alone).
  const parentGroups = useMemo(() => {
    const isParent = (c: Category) => categories.some((x) => x.parentId === c.id);
    const parents = categories.filter((c) => c.parentId === null && isParent(c));
    const standalone = categories.filter((c) => c.parentId === null && !isParent(c));
    return [
      ...parents.map((p) => ({ parent: p, leaves: categories.filter((c) => c.parentId === p.id) })),
      ...standalone.map((s) => ({ parent: s, leaves: [] as Category[] })),
    ];
  }, [categories]);

  // Validate + clamp URL params against known values (no unchecked casts).
  const validSlugs = useMemo(() => new Set(categories.map((c) => c.slug)), [categories]);
  const rawCategory = searchParams.get("category");
  // Before categories load, trust a present slug (avoids a throwaway "all" fetch +
  // heading flash on deep-links); once loaded, coerce unknown slugs to "all".
  const category = rawCategory ? (categories.length === 0 || validSlugs.has(rawCategory) ? rawCategory : "all") : "all";
  const search = searchParams.get("q") ?? "";
  const rawSort = searchParams.get("sort");
  const sort: SortOption = rawSort && rawSort in SORT_LABELS ? (rawSort as SortOption) : "newest";
  const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);

  useDocumentMeta(category !== "all" ? categories.find((c) => c.slug === category)?.name : undefined);

  const [inStockOnly, setInStockOnly] = useState(false);
  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    getProducts({ category, search, sort, page, pageSize: PAGE_SIZE, inStockOnly })
      .then((res) => {
        if (alive) {
          setResult(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [category, search, sort, page, inStockOnly]);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    });
    if (resetPage) next.delete("page");
    setSearchParams(next);
  };

  const activeCategory = categories.find((c) => c.slug === category);
  const heading = activeCategory ? activeCategory.name : "All Products";

  const resetAll = () => {
    setInStockOnly(false);
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters =
    Boolean(activeCategory) || Boolean(search) || inStockOnly;

  const FiltersContent = (
    <div className="flex flex-col gap-7">
      <CategoryNav groups={parentGroups} category={category} onSelect={(slug) => update({ category: slug })} />

      <div>
        <h4 className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Availability</h4>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={inStockOnly}
            onCheckedChange={(v) => setInStockOnly(Boolean(v))}
          />
          <span className="font-body text-sm">Hide out of stock</span>
        </label>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="self-start font-heading text-xs font-bold uppercase tracking-[0.25em] text-brand transition-colors hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Catalogue", to: "/catalogue" },
          ...(activeCategory ? [{ label: activeCategory.name }] : []),
        ]}
      />

      <div className="mt-6">
        <PageHeader
          eyebrow="Shop"
          title={heading}
          tagline={
            activeCategory
              ? `Browse our ${activeCategory.name} parts.`
              : "Browse every hand-picked part in the 360 Performance catalogue."
          }
        />
      </div>

      {/* Mobile search */}
      <div className="mt-6 xl:hidden">
        <SearchBar />
      </div>

      <div className="mt-8 flex gap-8">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">{FiltersContent}</div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-sm text-muted-foreground">
              {loading
                ? "Loading…"
                : `${result?.total ?? 0} product${result?.total === 1 ? "" : "s"}`}
            </p>

            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden">
                    <SlidersHorizontal className="size-4" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[85vw] max-w-sm overflow-auto border-r-2 border-brand bg-white"
                >
                  <SheetHeader className="border-b border-zinc-200 pb-4 text-left">
                    <SheetTitle className="font-heading text-2xl uppercase tracking-tight">
                      Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">{FiltersContent}</div>
                </SheetContent>
              </Sheet>

              <Select value={sort} onValueChange={(v) => update({ sort: v }, false)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {SORT_LABELS[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="mb-6 flex flex-wrap items-center gap-2">
              {activeCategory && (
                <FilterChip
                  label={`Category: ${activeCategory.name}`}
                  onRemove={() => update({ category: null })}
                />
              )}
              {search && (
                <FilterChip
                  label={`Search: "${search}"`}
                  onRemove={() => update({ q: null })}
                />
              )}
              {inStockOnly && (
                <FilterChip
                  label="In stock only"
                  onRemove={() => setInStockOnly(false)}
                />
              )}
              <button
                type="button"
                onClick={resetAll}
                className="ml-1 font-heading text-xs font-bold uppercase tracking-[0.25em] text-zinc-500 transition-colors hover:text-brand"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {error ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16 text-center">
              <PackageX className="size-12 text-muted-foreground" />
              <div>
                <h3>Couldn't load products</h3>
                <p className="mt-1 font-body text-sm text-muted-foreground">Something went wrong. Please try again.</p>
              </div>
              <Button variant="outline" onClick={() => window.location.reload()} className="font-heading uppercase tracking-[0.25em]">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : result && result.items.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((p: Product) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              {result.totalPages > 1 && (
                <nav
                  aria-label="Pagination"
                  className="mt-10 flex items-center justify-center gap-2"
                >
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={result.page <= 1}
                    onClick={() => update({ page: String(result.page - 1) }, false)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  {buildPageList(result.page, result.totalPages).map((p, i) =>
                    p === "ellipsis" ? (
                      <span
                        key={`e${i}`}
                        aria-hidden
                        className="px-1 font-heading text-sm font-bold text-zinc-400"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => update({ page: String(p) }, false)}
                        aria-current={p === result.page ? "page" : undefined}
                        className={`size-9 rounded-md font-heading text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                          p === result.page
                            ? "bg-brand text-white"
                            : "border border-border text-foreground hover:bg-accent"
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={result.page >= result.totalPages}
                    onClick={() => update({ page: String(result.page + 1) }, false)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </nav>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-5 rounded-lg border border-dashed border-border py-16 text-center">
              <PackageX className="size-12 text-muted-foreground" />
              <div>
                <h3>No products found</h3>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Try a different filter, or jump into a popular category.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {parentGroups.slice(0, 3).map((g) => (
                  <button
                    key={g.parent.id}
                    type="button"
                    onClick={() => {
                      setInStockOnly(false);
                      const next = new URLSearchParams();
                      next.set("category", g.parent.slug);
                      setSearchParams(next);
                    }}
                    className="border border-zinc-300 px-4 py-2 font-heading text-xs font-bold uppercase tracking-[0.25em] text-zinc-700 transition-colors hover:border-black hover:bg-black hover:text-white"
                  >
                    {g.parent.name}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={resetAll}
                className="font-heading uppercase tracking-[0.25em]"
              >
                Reset filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-zinc-300 bg-white px-3 py-1.5 font-body text-xs text-zinc-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="-mr-1 rounded-sm p-0.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function ProductCardSkeleton() {
  return (
    <div className="flex flex-col border border-zinc-200 bg-white">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-2 h-5 w-24" />
        <Skeleton className="mt-2 h-10 w-full" />
      </div>
    </div>
  );
}
