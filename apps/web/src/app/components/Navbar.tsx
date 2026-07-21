import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import { Menu, MessageCircle, Search as SearchIcon, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@360/ui/sheet";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";
import { getCategories } from "../data/api";
import type { Category } from "../data/products";
import { whatsappGeneralUrl } from "@360/lib/whatsapp";

const NAV_LINKS = [
  { label: "Shop", to: "/catalogue" },
  { label: "Our Story", to: "/#our-story" },
  { label: "News", to: "/blog" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRowRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let alive = true;
    getCategories()
      .then((cats) => alive && setCategories(cats.filter((c) => c.parentId === null)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (searchOpen && searchRowRef.current) {
      const input = searchRowRef.current.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
      input?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Mobile menu */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="-ml-2 rounded-md p-2 text-white transition-colors hover:bg-white/10 lg:hidden"
            >
              <Menu className="size-6" />
            </button>
          </SheetTrigger>
          {/* Column layout: fixed header, SCROLLABLE middle, pinned CTA. Without the scroll container
              the category list pushed the WhatsApp button below the viewport — and Radix locks body
              scroll while the sheet is open, so on a phone it was simply unreachable. */}
          <SheetContent
            side="left"
            className="flex h-dvh w-[88vw] max-w-sm flex-col border-r border-white/10 bg-black p-0 text-white"
          >
            <SheetHeader className="shrink-0 border-b border-white/10 p-4 text-left">
              <SheetTitle className="text-white">
                <Logo className="h-7" onClick={() => setMenuOpen(false)} />
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4">
                <SearchBar onNavigate={() => setMenuOpen(false)} />
              </div>
              <nav className="flex flex-col px-2">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-4 py-3 font-heading text-lg uppercase tracking-wide text-white transition-colors hover:bg-brand"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              {/* Only when there are categories — a failed fetch previously left the
                  "Categories" heading sitting above an empty list. */}
              {categories.length > 0 && (
              <div className="mt-2 border-t border-white/10 px-4 py-3">
                <p className="mb-2 font-heading text-xs uppercase tracking-widest text-white/50">
                  Categories
                </p>
                <div className="flex flex-col">
                  {categories.map((c) => (
                    <Link
                      key={c.id}
                      to={`/catalogue?category=${c.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className="rounded-md px-2 py-2 font-body text-sm text-white/80 transition-colors hover:text-brand"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* Pinned: the primary CTA must never scroll out of reach. */}
            <div className="shrink-0 border-t border-white/10 p-4">
              <a
                href={whatsappGeneralUrl()}
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-sm bg-brand px-4 py-3 font-heading text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-hover"
              >
                <MessageCircle className="size-4" /> Order on WhatsApp
              </a>
            </div>
          </SheetContent>
        </Sheet>

        <Logo className="h-6 sm:h-7" />

        {/* Desktop nav — genuinely centered. `mx-auto` here plus `ml-auto` on the right cluster
            split the free space three ways, landing the links about a third across rather than
            in the middle. Centring against the bar itself is independent of how wide the logo
            and the right-hand controls happen to be. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `font-heading text-sm uppercase tracking-[0.2em] transition-colors hover:text-brand ${
                  isActive && link.to === "/catalogue" ? "text-brand" : "text-white/85"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search"
            aria-expanded={searchOpen}
            className="rounded-md p-2 text-white transition-colors hover:bg-white/10"
          >
            {searchOpen ? <X className="size-5" /> : <SearchIcon className="size-5" />}
          </button>
          {/* Always visible — this was `hidden sm:inline-flex`, so on a phone (the dominant device
              here) the site's persistent WhatsApp entry point simply vanished. Below 640px it
              collapses to an icon-only button to fit; the label returns from sm up. */}
          <a
            href={whatsappGeneralUrl()}
            target="_blank"
            rel="noreferrer"
            aria-label="Talk to us on WhatsApp"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm bg-brand px-3 py-2 font-heading text-xs font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-4"
          >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">Talk To Us</span>
          </a>
        </div>
      </div>

      {/* Expanding search */}
      {searchOpen && (
        <div ref={searchRowRef} className="border-t border-white/10 bg-black">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 lg:px-8">
            <SearchBar onNavigate={() => setSearchOpen(false)} autoFocus />
          </div>
        </div>
      )}
    </header>
  );
}
