// Top bar: page title, working global search, notifications, date range, user menu.
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  Check,
  FileText,
  KanbanSquare,
  LogOut,
  Menu,
  Package,
  PackageX,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../../data/auth";
import { useOrders, STAGE_LABEL } from "../../data/orders";
import { useInvoices } from "../../data/invoices";
import { useProducts } from "../../data/catalog";
import { useCustomers } from "../../data/crm";
import { formatPKR } from "@360/lib/format";
import { Input } from "@360/ui/input";
import { Button } from "@360/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@360/ui/dropdown-menu";
import { cn } from "@360/ui/utils";
import { usePageMeta } from "../common/PageHeader";

const EMPTY: never[] = []; // stable empty fallback (keeps useMemo deps stable)

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  to: string;
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const orders = useOrders().data ?? EMPTY;
  const invoices = useInvoices().data ?? EMPTY;
  const products = useProducts().data ?? EMPTY;
  const customers = useCustomers().data ?? EMPTY;
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Cross-module search.
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: SearchResult[] = [];
    for (const o of orders) {
      const cust = o.customers?.name ?? "";
      if ((o.order_no ?? "").toLowerCase().includes(q) || cust.toLowerCase().includes(q))
        out.push({ id: o.id, label: o.order_no ?? "", sub: `${cust} · ${STAGE_LABEL[o.stage]}`, icon: KanbanSquare, to: "/orders" });
    }
    for (const i of invoices) {
      const cust = i.customers?.name ?? "";
      if ((i.invoice_no ?? "").toLowerCase().includes(q) || cust.toLowerCase().includes(q))
        out.push({ id: i.id, label: i.invoice_no ?? "", sub: `${cust} · ${i.balance?.status ?? ""}`, icon: FileText, to: "/invoices" });
    }
    for (const p of products) {
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
        out.push({ id: p.id, label: p.name, sub: `${p.categories?.name ?? ""} · ${p.price_pkr === null ? "—" : formatPKR(p.price_pkr)}`, icon: Package, to: "/products" });
    }
    for (const c of customers) {
      if (c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
        out.push({ id: c.id, label: c.name, sub: `${c.type} · ${c.city ?? ""}`, icon: Users, to: "/data" });
    }
    return out.slice(0, 8);
  }, [query, orders, invoices, products, customers]);

  // Notifications: overdue invoices + out-of-stock products.
  const notifications = useMemo(() => {
    const items: { id: string; text: string; sub: string; to: string }[] = [];
    for (const i of invoices) {
      if (i.balance?.status === "overdue")
        items.push({ id: "n-" + i.id, text: `Overdue: ${i.invoice_no}`, sub: `${formatPKR(i.balance.balance_pkr)} outstanding`, to: "/invoices" });
    }
    for (const p of products) {
      if (p.availability === "out_of_stock" && p.visibility === "visible")
        items.push({ id: "n-" + p.id, text: `Out of stock: ${p.name}`, sub: p.categories?.name ?? "", to: "/products" });
    }
    return items;
  }, [invoices, products]);

  // The current page's title/subtitle — published by usePageHeader()/<PageHeader> on each page.
  const { title, subtitle } = usePageMeta();

  function go(to: string) {
    setQuery("");
    setFocused(false);
    navigate(to);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="size-5" />
      </Button>

      {/* Current page title — fills the shell's left slot, which was empty on desktop. */}
      {title && (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="h-8 w-1 shrink-0 bg-[#cc0000]" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-none sm:text-xl">{title}</h1>
            {subtitle && (
              <p className="mt-1 hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
            )}
          </div>
        </div>
      )}

      {/* Global search */}
      <div className="relative ml-auto hidden w-full max-w-xs md:block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search orders, invoices, products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
          className="pl-9"
        />
        {focused && query && (
          <div
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover shadow-lg scrollbar-hide"
            onMouseDown={() => clearTimeout(blurTimer.current)}
          >
            {results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No matches for “{query}”.</p>
            ) : (
              results.map((r) => (
                <button
                  key={r.to + r.id}
                  onClick={() => go(r.to)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
                >
                  <r.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Quick create — lands on the target page and pops its create form (via ?new=1) */}
      {can("edit") && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="ml-auto gap-1.5 bg-[#cc0000] text-white hover:bg-[#a30000] md:ml-0">
              <Plus className="size-4" /> <span className="hidden sm:inline">New</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/orders?new=1")}><KanbanSquare className="size-4" /> Order</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/products?new=1")}><Package className="size-4" /> Product</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/finance?tab=expenses&new=1")}><Receipt className="size-4" /> Record expense</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/purchasing?new=1")}><ShoppingBag className="size-4" /> Purchase order</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative ml-auto md:ml-0" aria-label="Notifications">
            <Bell className="size-5" />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-[#cc0000] text-[10px] font-bold text-white">
                {notifications.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <span className="font-heading text-sm font-bold uppercase tracking-wide text-foreground">Notifications</span>
            {notifications.length > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#cc0000] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {notifications.length}
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
              <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Check className="size-5" />
              </span>
              <p className="text-sm font-medium text-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground">No overdue invoices or out-of-stock products.</p>
            </div>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              {notifications.map((n) => {
                const overdue = n.to === "/invoices";
                const Icon = overdue ? Receipt : PackageX;
                return (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => navigate(n.to)}
                    className="flex cursor-pointer items-start gap-3 rounded-none border-b border-border/60 px-4 py-3 last:border-b-0 focus:bg-accent"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                        overdue ? "bg-[#cc0000]/10" : "bg-amber-100",
                      )}
                    >
                      <Icon className={cn("size-4", overdue ? "text-[#cc0000]" : "text-amber-700")} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{n.text}</span>
                      <span className="block truncate text-xs text-muted-foreground">{n.sub}</span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex size-9 items-center justify-center rounded-sm bg-black text-sm font-bold text-white">
            {(user?.name ?? "A").charAt(0)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user?.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/settings")}>
            <UserCog className="size-4" /> Account & roles
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-[#cc0000] focus:text-[#cc0000]">
            <LogOut className="size-4" /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
