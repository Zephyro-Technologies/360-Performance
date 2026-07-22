import { Truck, ShieldCheck, RotateCcw, Wallet } from "lucide-react";
import { Link } from "react-router";
import { PAYMENT_METHODS } from "../data/content";

// The buying reassurances a WhatsApp customer weighs before messaging — including HOW to pay,
// which the site never stated. Delivery and returns link to the policy that backs them up.
const ITEMS = [
  { icon: Truck, title: "Nationwide delivery", sub: "Shipped across Pakistan", to: "/policies/shipping" },
  { icon: ShieldCheck, title: "Genuine parts", sub: "Hand-picked, no fakes", to: undefined },
  { icon: RotateCcw, title: "7-day returns", sub: "If it's not right", to: "/policies/returns" },
  { icon: Wallet, title: "Flexible payment", sub: PAYMENT_METHODS.join(" · "), to: undefined },
];

export function TrustStrip({
  tone = "light",
  cols = 4,
  className = "",
}: {
  tone?: "light" | "dark";
  cols?: 2 | 4;
  className?: string;
}) {
  const dark = tone === "dark";
  const grid = cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  const box = dark ? "border-white/10 bg-white/5 hover:border-brand/40" : "border-border bg-muted/40 hover:border-black/30";
  return (
    <ul className={`grid gap-3 ${grid} ${className}`}>
      {ITEMS.map(({ icon: Icon, title, sub, to }) => {
        const inner = (
          <span className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0">
              <span className={`block font-heading text-sm font-bold uppercase tracking-wide ${dark ? "text-white" : "text-black"}`}>
                {title}
              </span>
              <span className={`block font-body text-xs ${dark ? "text-white/60" : "text-zinc-500"}`}>{sub}</span>
            </span>
          </span>
        );
        return (
          <li key={title}>
            {to ? (
              <Link
                to={to}
                className={`block rounded-lg border p-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${box}`}
              >
                {inner}
              </Link>
            ) : (
              <div className={`rounded-lg border p-4 ${dark ? "border-white/10 bg-white/5" : "border-border bg-muted/40"}`}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
