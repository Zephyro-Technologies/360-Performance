import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { AnnouncementBar } from "./AnnouncementBar";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ScrollManager />
      {/* First focusable element: lets keyboard and screen-reader users jump the nav straight to
          the page content. Off-screen until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:font-heading focus:text-sm focus:font-bold focus:uppercase focus:tracking-wide focus:text-white"
      >
        Skip to content
      </a>
      <AnnouncementBar />
      <Navbar />
      {/* tabIndex -1 so the skip link can move focus here without making it a tab stop. */}
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
