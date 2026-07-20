import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "@360/ui/sonner";
import { Layout } from "./components/Layout";
import { RouteError } from "./components/RouteError";
import { Landing } from "./pages/Landing";

// The landing page is eager (LCP); every other page is lazy-loaded on navigation.
const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: RouteError,
    children: [
      {
        // page render errors surface here, inside the site chrome
        ErrorBoundary: RouteError,
        children: [
          { index: true, Component: Landing },
          { path: "catalogue", lazy: async () => ({ Component: (await import("./pages/Catalogue")).Catalogue }) },
          { path: "product/:id", lazy: async () => ({ Component: (await import("./pages/ProductDetail")).ProductDetail }) },
          { path: "blog", lazy: async () => ({ Component: (await import("./pages/Blog")).Blog }) },
          { path: "blog/:slug", lazy: async () => ({ Component: (await import("./pages/BlogPostPage")).BlogPostPage }) },
          { path: "policies/returns", lazy: async () => ({ Component: (await import("./pages/PolicyPage")).ReturnsPolicy }) },
          { path: "policies/shipping", lazy: async () => ({ Component: (await import("./pages/PolicyPage")).ShippingPolicy }) },
          { path: "policies/privacy", lazy: async () => ({ Component: (await import("./pages/PolicyPage")).PrivacyPolicy }) },
          { path: "*", lazy: async () => ({ Component: (await import("./pages/NotFound")).NotFound }) },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
    </>
  );
}
