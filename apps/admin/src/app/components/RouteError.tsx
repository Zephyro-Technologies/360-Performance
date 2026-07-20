import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";
import { Button } from "@360/ui/button";

// Route-level error boundary — a render/loader throw shows this instead of a blank
// white screen. Wired into the router (root + dashboard) in routes.tsx.
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred.";
  console.error("Route error:", error);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-md break-words font-mono text-sm text-muted-foreground">{detail}</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate(0)}>
          Reload
        </Button>
        <Button onClick={() => navigate("/")}>Back to dashboard</Button>
      </div>
    </div>
  );
}
