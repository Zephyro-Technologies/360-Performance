import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Search } from "lucide-react";
import { suggestProducts } from "../data/api";
import type { Product } from "../data/products";
import { formatPKR } from "@360/lib/format";
import { ImageWithFallback } from "@360/ui/ImageWithFallback";

export function SearchBar({
  className = "",
  onNavigate,
  autoFocus = false,
}: {
  className?: string;
  onNavigate?: () => void;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Debounced. The dropdown opens on the first keystroke, so firing a query per character both
  // hammered the API and — because `suggestions` stays [] for the whole round trip — flashed
  // "No matches for 'e'" while the query for "e" was still in flight. A failed request is also
  // tracked separately: "we couldn't search" is not the same claim as "there is nothing".
  useEffect(() => {
    const q = term.trim();
    if (!q) {
      setSuggestions([]);
      setLoading(false);
      setErrored(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setErrored(false);
    const timer = setTimeout(() => {
      suggestProducts(q)
        .then((r) => {
          if (!alive) return;
          setSuggestions(r);
          setLoading(false);
        })
        .catch(() => {
          if (!alive) return;
          setSuggestions([]);
          setErrored(true);
          setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setTerm("");
    onNavigate?.();
    navigate(path);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    go(`/catalogue?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={submit} role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={term}
            autoFocus={autoFocus}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => term && setOpen(true)}
            placeholder="Search parts, brands…"
            aria-label="Search products"
            className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 font-body text-sm text-black outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </form>

      {open && term.trim() && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          {loading ? (
            <p className="px-4 py-3 font-body text-sm text-muted-foreground">Searching…</p>
          ) : errored ? (
            <p className="px-4 py-3 font-body text-sm text-muted-foreground">
              Couldn't search just now — check your connection and try again.
            </p>
          ) : suggestions.length === 0 ? (
            <p className="px-4 py-3 font-body text-sm text-muted-foreground">
              No matches for “{term}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => go(`/product/${p.slug}`)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <ImageWithFallback
                      src={p.images[0]}
                      alt={p.name}
                      className="size-10 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-sm text-foreground">
                        {p.name}
                      </span>
                      <span className="block font-body text-xs text-muted-foreground">
                        {/* Quote the price the customer actually sees, matching ProductCard,
                            ProductDetail and the WhatsApp order message. Showing pricePKR here
                            advertised the higher, struck-through price on the search path. */}
                        {formatPKR(
                          p.salePricePKR != null && p.salePricePKR < p.pricePKR
                            ? p.salePricePKR
                            : p.pricePKR,
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
