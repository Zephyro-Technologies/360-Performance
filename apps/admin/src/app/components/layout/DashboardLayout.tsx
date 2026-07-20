// App shell: fixed black sidebar (desktop) / drawer (mobile) + topbar + content.
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Sheet, SheetContent, SheetTitle } from "@360/ui/sheet";
import { useAuth } from "../../data/auth";
import { isRemembered } from "../../data/supabase";
import { PageHeaderProvider } from "../common/PageHeader";

// Auto-logout after this many minutes of inactivity — skipped when the user
// signed in with "Remember me" (they opted to stay logged in / no expiry).
const IDLE_MINUTES = 15;

export function DashboardLayout() {
  const { user, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset an idle timer on any user activity; log out when it elapses.
  // "Remember me" opts out of the idle timeout entirely (no expiry).
  useEffect(() => {
    if (!user || isRemembered()) return;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        logout();
        toast.warning("Session expired due to inactivity. Please sign in again.");
      }, IDLE_MINUTES * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, logout]);

  if (loading) {
    return (
      <div className="grid h-screen w-full place-items-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    // Provides the page title/subtitle the Topbar renders (published per page by <PageHeader>).
    <PageHeaderProvider>
      <div className="grid h-screen w-full grid-cols-1 lg:grid-cols-[256px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden h-screen lg:block">
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-64 border-r-0 bg-black p-0 text-white">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex h-screen min-w-0 flex-col">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto bg-secondary/40 p-4 sm:p-6">
            {/* The reporting period is NOT plumbed through here — it lives in the URL, read by
                usePeriodParams() in the two pages that use it (Analytics, MetricDetail). */}
            <Outlet />
          </main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}
