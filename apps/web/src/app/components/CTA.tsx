import type { MouseEventHandler, ReactNode } from "react";
import { Link } from "react-router";

// One call-to-action treatment for the whole storefront, replacing ~9 hand-rolled button styles
// with three variants × three sizes and a single radius. `tone` is the BACKGROUND the CTA sits on
// (dark vs light), which flips the outline colours and the focus ring.
//
// Renders the right element for its role: `to` → <Link>, `href` → external <a>, otherwise <button>.

type CTAVariant = "primary" | "outline" | "dark";
type CTASize = "sm" | "md" | "lg";
type CTATone = "light" | "dark";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm font-heading font-bold uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none";

// sm keeps a 44px (h-11) tap target; md/lg are the page-level hero/detail sizes.
const SIZES: Record<CTASize, string> = {
  sm: "h-11 px-5 text-xs tracking-[0.2em]",
  md: "h-12 px-8 text-sm tracking-[0.2em]",
  lg: "h-14 px-8 text-base tracking-wide",
};

function variantClasses(variant: CTAVariant, tone: CTATone): string {
  const ring = tone === "dark" ? "focus-visible:outline-white" : "focus-visible:outline-brand";
  if (variant === "primary") return `bg-brand text-white hover:bg-brand-hover ${ring}`;
  if (variant === "dark") return `bg-black text-white hover:bg-brand ${ring}`;
  // outline — colours follow the background it sits on
  return tone === "dark"
    ? `border border-white/30 text-white hover:bg-white hover:text-black ${ring}`
    : `border border-black text-black hover:bg-black hover:text-white ${ring}`;
}

type CTAProps = {
  to?: string;
  href?: string;
  onClick?: MouseEventHandler;
  type?: "button" | "submit";
  ariaLabel?: string;
  variant?: CTAVariant;
  size?: CTASize;
  tone?: CTATone;
  className?: string;
  children: ReactNode;
};

export function CTA({
  to,
  href,
  onClick,
  type = "button",
  ariaLabel,
  variant = "primary",
  size = "md",
  tone = "light",
  className = "",
  children,
}: CTAProps) {
  const cls = `${BASE} ${SIZES[size]} ${variantClasses(variant, tone)} ${className}`;
  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={cls}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={onClick} aria-label={ariaLabel} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} aria-label={ariaLabel} className={cls}>
      {children}
    </button>
  );
}
