import { Link } from "react-router";
import { Home, Search } from "lucide-react";
import { Button } from "@360/ui/button";
import { SearchBar } from "../components/SearchBar";
import { useDocumentMeta } from "../lib/head";

export function NotFound() {
  // Otherwise a dead URL keeps the previous route's title, description and canonical.
  // noindex: a soft 404 serves HTTP 200 (SPA fallback), so without this a mistyped or dead URL
  // would be indexable as a thin "not found" page.
  useDocumentMeta("Page Not Found", "That page doesn't exist. Browse the catalogue or search for a part.", undefined, {
    robots: "noindex, follow",
  });

  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden bg-black px-4 text-white">
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <span className="font-heading text-[8rem] font-black leading-none text-brand sm:text-[12rem]">
          404
        </span>
        <h1 className="-mt-4 text-white">Off The Track</h1>
        <p className="mt-4 font-body text-white/60">
          The page you're looking for doesn't exist or has been moved. Try a search,
          or jump back to the action.
        </p>

        <div className="mt-8 w-full max-w-md">
          <SearchBar autoFocus />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            className="h-11 bg-brand px-8 text-brand-foreground hover:bg-brand-hover"
          >
            <Link to="/">
              <Home className="size-4" /> HOME
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 border-white/30 bg-transparent px-8 text-white hover:bg-white hover:text-black"
          >
            <Link to="/catalogue">
              <Search className="size-4" /> BROWSE CATALOGUE
            </Link>
          </Button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(204,0,0,0.15),transparent_60%)]" />
    </div>
  );
}
