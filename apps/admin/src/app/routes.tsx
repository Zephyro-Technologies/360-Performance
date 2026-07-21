// Route configuration (React Router data mode). Heavy dashboard pages are
// lazy-loaded so their code (and recharts / react-dnd) only loads on navigation.
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { AuthProvider } from "./data/auth";
import { ConfirmProvider } from "./components/common/confirm";
import { Toaster } from "@360/ui/sonner";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { RouteError } from "./components/RouteError";
import { Login } from "./pages/Login";
import { Analytics } from "./pages/Analytics";

// AuthProvider lives at the top so every route shares one auth context. ConfirmProvider sits with
// it so any page can await a styled confirmation without mounting its own dialog.
function Root() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <Outlet />
        <Toaster position="top-right" richColors />
      </ConfirmProvider>
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    ErrorBoundary: RouteError,
    children: [
      { path: "login", Component: Login },
      {
        Component: DashboardLayout,
        children: [
          {
            // page render errors surface here, inside the dashboard chrome
            ErrorBoundary: RouteError,
            children: [
              { index: true, Component: Analytics },
              { path: "insights/:metric", lazy: async () => ({ Component: (await import("./pages/MetricDetail")).MetricDetail }) },
              { path: "orders", lazy: async () => ({ Component: (await import("./pages/Orders")).Orders }) },
              { path: "orders/:id", lazy: async () => ({ Component: (await import("./pages/OrderDetailPage")).OrderDetailPage }) },
              { path: "invoices", lazy: async () => ({ Component: (await import("./pages/Invoices")).Invoices }) },
              { path: "products", lazy: async () => ({ Component: (await import("./pages/Products")).Products }) },
              { path: "products/:id", lazy: async () => ({ Component: (await import("./pages/ProductDetail")).ProductDetail }) },
              { path: "purchasing", lazy: async () => ({ Component: (await import("./pages/Purchasing")).Purchasing }) },
              { path: "purchasing/:id", lazy: async () => ({ Component: (await import("./pages/PurchaseOrderDetail")).PurchaseOrderDetail }) },
              { path: "data", lazy: async () => ({ Component: (await import("./pages/DataManagement")).DataManagement }) },
              { path: "finance", lazy: async () => ({ Component: (await import("./pages/Finance")).Finance }) },
              { path: "investors", lazy: async () => ({ Component: (await import("./pages/Investors")).Investors }) },
              { path: "blog", lazy: async () => ({ Component: (await import("./pages/Blog")).Blog }) },
              { path: "settings", lazy: async () => ({ Component: (await import("./pages/Settings")).Settings }) },
            ],
          },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
