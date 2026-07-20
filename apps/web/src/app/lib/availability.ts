import type { Availability } from "../data/products";

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  "in-stock": "In Stock",
  "low-stock": "Low Stock",
  "made-to-order": "Made to Order",
  "out-of-stock": "Out of Stock",
};

// Tailwind classes for the availability badge dot/text.
export const AVAILABILITY_STYLES: Record<Availability, string> = {
  "in-stock": "text-green-700 bg-green-50 border-green-200",
  "low-stock": "text-amber-700 bg-amber-50 border-amber-200",
  "made-to-order": "text-blue-700 bg-blue-50 border-blue-200",
  "out-of-stock": "text-zinc-700 bg-zinc-100 border-zinc-300",
};
