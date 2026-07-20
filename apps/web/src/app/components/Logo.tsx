import { Link } from "react-router";

// The 360 Performance wordmark (real production SVG, baked glyph paths — no font load).
// White text + red slash, for the dark surfaces it sits on (navbar/footer/sheet).
// `className` controls the height (callers pass h-6/h-7/…); width scales with it.
export function Logo({
  className = "h-7",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to="/"
      onClick={onClick}
      className="inline-flex select-none items-center"
      aria-label="360 Performance — home"
    >
      <img src="/logo.svg" alt="360 Performance" draggable={false} className={`w-auto ${className}`} />
    </Link>
  );
}
