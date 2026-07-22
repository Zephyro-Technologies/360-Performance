import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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
  const navigate = useNavigate();
  // Category lives in the PATH now (/catalogue/:category) so it gets its own prerendered page and
  // a category-specific share preview. Legacy ?category= links still resolve (redirected below).
  const { category: pathCategory } = useParams<{ category?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  // Swallowing this failure collapsed the sidebar to a lone "All Products" button and stripped
  // the empty state's category shortcuts, with nothing to say anything had gone wrong.
  const [categoriesError, setCategoriesError] = useState(false);

  useEffect(() => {
    let alive = true;
    getCategories()
      .then((c) => {
        if (!alive) return;
        setCategories(c);
        setCategoriesError(false);
      })
      .catch(() => alive && setCategoriesError(true));
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
  const rawCategory = pathCategory ?? searchParams.get("category");
  // Before categories load, trust a present slug (avoids a throwaway "all" fetch +
  // heading flash on deep-links); once loaded, coerce unknown slugs to "all".
  const category = rawCategory ? (categories.length === 0 || validSlugs.has(rawCategory) ? rawCategory : "all") : "all";

  // Keep one canonical URL shape for a category. A legacy ?category=x link becomes /catalogue/x
  // (carrying any q/sort/page), and a path category that doesn't exist (typo, retired slug) falls
  // back to all-products so it can't self-canonicalise a dead URL.
  useEffect(() => {
    const legacy = searchParams.get("category");
    if (!pathCategory && legacy) {
      const qs = new URLSearchParams(searchParams);
      qs.delete("category");
      const query = qs.toString();
      navigate(`/catalogue/${legacy}${query ? `?${query}` : ""}`, { replace: true });
      return;
    }
    if (pathCategory && categories.length > 0 && !validSlugs.has(pathCategory)) {
      navigate("/catalogue", { replace: true });
    }
  }, [pathCategory, searchParams, categories.length, validSlugs, navigate]);

  const search = searchParams.get("q") ?? "";
  const rawSort = searchParams.get("sort");
  const sort: SortOption = rawSort && rawSort in SORT_LABELS ? (rawSort as SortOption) : "newest";
  const page = Math.max(1, Math.floor(Number(searchParams.get("page") ?? "1")) || 1);

  // Selecting a category navigates to its path, keeping the current search/sort and resetting page.
  const selectCategory = (slug: string | null) => {
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (sort !== "newest") qs.set("sort", sort);
    const query = qs.toString();
    navigate(`${slug ? `/catalogue/${slug}` : "/catalogue"}${query ? `?${query}` : ""}`);
  };

  const metaCategory = category !== "all" ? categories.find((c) => c.slug === category) : undefined;

  // In a URL param (?instock=1), not local state, so a filtered link shared on WhatsApp — the
  // primary distribution channel — keeps the filter and survives a refresh.
  const inStockOnly = searchParams.get("instock") === "1";
  const [result, setResult] = useState<CatalogueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useDocumentMeta(
    metaCategory?.name ?? "Shop All Parts",
    metaCategory
      ? `Browse ${metaCategory.name} parts at 360 Performance — genuine, hand-picked, shipped across Pakistan. Order on WhatsApp.`
      : "Browse the full 360 Performance catalogue — genuine performance parts for exhausts, cooling, fuelling, suspension and more, shipped across Pakistan.",
    undefined,
    {
      // The category is in the pathname now, so the canonical only needs the page. An out-of-range
      // page must not self-canonicalise — `result.page` is the page actually served.
      canonicalParams: {
        page: result && result.page > 1 ? result.page : null,
      },
    },
  );

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

  // getProducts serves the LAST real page when ?page= overshoots the end. Mirror the corrected
  // page back into the URL so the address bar, the pagination control and the visible results
  // agree — otherwise a stale link showed "N products" above "No products found" with no way back.
  useEffect(() => {
    if (!result || result.page === page) return;
    const next = new URLSearchParams(searchParams);
    if (result.page <= 1) next.delete("page");
    else next.set("page", String(result.page));
    setSearchParams(next, { replace: true });
  }, [result, page, searchParams, setSearchParams]);

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

  // Clears the category (path) and all query filters, including ?instock.
  const resetAll = () => navigate("/catalogue");

  // Pagination scrolls back to the top of the results — ScrollManager only reacts to pathname and
  // hash, so a ?page= change left the visitor parked at the bottom looking at the new page's tail.
  const goToPage = (p: number) => {
    update({ page: String(p) }, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hasActiveFilters =
    Boolean(activeCategory) || Boolean(search) || inStockOnly;

  const FiltersContent = (
    <div className="flex flex-col gap-7">
      {categoriesError && (
        <p className="border border-dashed border-zinc-300 px-3 py-2 font-body text-xs text-zinc-600">
          Couldn't load categories — refresh to filter by category.
        </p>
      )}
      <CategoryNav groups={parentGroups} category={category} onSelect={selectCategory} />

      <div>
        <h4 className="mb-2 font-heading text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">Availability</h4>
        {/* Radix Checkbox renders a <button role="checkbox">, not a labelable form control, so an
            implicit wrapping <label> left it with NO accessible name. id + htmlFor associates them
            explicitly (and makes the visible text a hit target). */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="hide-out-of-stock"
            checked={inStockOnly}
            onCheckedChange={(v) => update({ instock: v ? "1" : null })}
          />
          <label htmlFor="hide-out-of-stock" className="cursor-pointer font-body text-sm">
            Hide sold out
          </label>
        </div>
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
        {/* Shown from md, not lg: at 768–1023px the page previously had 1000px of width and
            still no sidebar, so the phone layout rendered at tablet size. */}
        <aside className="hidden w-52 shrink-0 md:block lg:w-60">
          {/* Bounded + scrollable: with several accordion groups open the column exceeded the
              viewport, and a sticky element taller than the viewport pins its top, making the
              bottom — including "Reset filters" — permanently unreachable. */}
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-1">
            {FiltersContent}
          </div>
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
                  {/* SheetContent ships no padding, so these sat flush at x=0 while the
                      sheet header above them was inset 16px. */}
                  <div className="mt-6 px-4 pb-4">{FiltersContent}</div>
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
                  onRemove={() => selectCategory(null)}
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
                  label="Hide sold out"
                  onRemove={() => update({ instock: null })}
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
                <h2 className="text-xl">Couldn't load products</h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">Something went wrong. Please try again.</p>
              </div>
              <Button variant="outline" onClick={() => window.location.reload()} className="font-heading uppercase tracking-[0.25em]">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {/* Match PAGE_SIZE — six placeholders for a nine-item page grew the grid by a row. */}
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
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
                    onClick={() => goToPage(result.page - 1)}
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
                        onClick={() => goToPage(p)}
                        aria-current={p === result.page ? "page" : undefined}
                        className={`size-11 rounded-md font-heading text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
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
                    onClick={() => goToPage(result.page + 1)}
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
                <h2 className="text-xl">No products found</h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Try a different filter, or jump into a popular category.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {parentGroups.slice(0, 3).map((g) => (
                  <button
                    key={g.parent.id}
                    type="button"
                    onClick={() => navigate(`/catalogue/${g.parent.slug}`)}
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
        className="-mr-1 rounded-sm p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
