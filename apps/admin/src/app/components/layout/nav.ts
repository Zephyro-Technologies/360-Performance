
// Shared navigation definition for sidebar + mobile drawer.
import {
  LayoutDashboard,
  KanbanSquare,
  FileText,
  Package,
  ShoppingBag,
  Database,
  Wallet,
  Landmark,
  Newspaper,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  label?: string; // optional heading; omit for the top/bottom standalone items
  items: NavItem[];
}

// Grouped navigation — the sidebar renders section headings; a flat NAV_ITEMS is derived
// for consumers that just need the list (e.g. the Topbar's active-page lookup).
export const NAV_SECTIONS: NavSection[] = [
  { items: [{ to: "/", label: "Analytics", icon: LayoutDashboard, end: true }] },
  {
    label: "Sell",
    items: [
      { to: "/orders", label: "Order Pipeline", icon: KanbanSquare },
      { to: "/invoices", label: "Sales Documents", icon: FileText },
      { to: "/products", label: "Catalogue", icon: Package },
    ],
  },
  {
    label: "Sourcing",
    items: [
      { to: "/purchasing", label: "Purchasing", icon: ShoppingBag },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/finance", label: "Finance", icon: Wallet },
      { to: "/investors", label: "Investors", icon: Landmark },
    ],
  },
  { label: "Records", items: [{ to: "/data", label: "Data Management", icon: Database }] },
  { label: "Content", items: [{ to: "/blog", label: "Blog", icon: Newspaper }] },
  { items: [{ to: "/settings", label: "Settings", icon: Settings }] },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
