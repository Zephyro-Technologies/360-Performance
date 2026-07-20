import { Link, useRouteError } from "react-router";

// Route-level error boundary — a render throw shows this branded fallback instead
// of a blank white screen. Wired into the router in App.tsx. (Unmatched URLs are
// handled separately by the NotFound route.)
export function RouteError() {
  const error = useRouteError();
  console.error("Route error:", error);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-black">Something went wrong</h1>
      <p className="font-body text-muted-foreground">
        An unexpected error occurred. Please refresh, or head back home.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 bg-brand px-6 py-3 font-heading text-xs font-bold uppercase tracking-[0.3em] text-white transition-colors hover:bg-brand-hover"
      >
        Back to home
      </Link>
    </div>
  );
}
