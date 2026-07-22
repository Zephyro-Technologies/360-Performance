import { useEffect, useId, useRef, useState } from "react";
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
  // The keyboard-highlighted option; -1 = none. Tracked via aria-activedescendant so focus stays
  // in the input (the APG combobox pattern) rather than tabbing through each suggestion.
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  // Reset the highlight whenever the query changes; each new set of results starts unselected.
  useEffect(() => setActive(-1), [term]);

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

  const showPanel = open && !!term.trim();

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // Dismissible from the keyboard on every page — previously only the navbar bound Escape,
      // so on /catalogue and /404 the panel could not be closed without a mouse.
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!showPanel || suggestions.length === 0) return;
    const max = suggestions.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i >= max ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? max : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // choose the highlighted product instead of submitting the search
      go(`/product/${suggestions[active].slug}`);
    }
  };

  const statusText = showPanel
    ? loading
      ? "Searching"
      : errored
        ? "Couldn't search"
        : suggestions.length === 0
          ? "No matches"
          : `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} available`
    : "";

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        // Close when focus leaves the whole widget (keyboard tab-out).
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <form onSubmit={submit} role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={term}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => term && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search parts, brands…"
            aria-label="Search products"
            className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 font-body text-sm text-black outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </form>

      {/* Announces result state to screen readers without the visual panel having to be read. */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusText}
      </p>

      {showPanel && (
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
            <ul id={listId} role="listbox" aria-label="Product suggestions" className="max-h-80 overflow-auto py-1">
              {suggestions.map((p, i) => (
                // role="option" (not a button) so focus stays in the input and the arrow keys drive
                // aria-activedescendant. mousedown is prevented so a click doesn't blur-then-close
                // the panel before the click registers.
                <li
                  key={p.id}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(`/product/${p.slug}`)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-left ${
                    i === active ? "bg-accent" : ""
                  }`}
                >
                  <ImageWithFallback
                    src={p.images[0]}
                    alt=""
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
