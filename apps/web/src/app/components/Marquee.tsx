/**
 * Horizontally-scrolling tagline strip, mirroring the reference site's
 * "360 PERFORMANCE • PREMIUM …" band. Pure CSS animation, no JS.
 * Pauses on hover and respects prefers-reduced-motion via the parent's media query.
 */
export function Marquee({
  items,
  tone = "dark",
}: {
  items: string[];
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  const row = [...items, ...items, ...items, ...items];

  return (
    <div
      className={`group relative overflow-hidden border-y ${
        dark ? "border-white/10 bg-black text-white" : "border-zinc-200 bg-white text-black"
      }`}
      aria-hidden
    >
      <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-12 py-5 motion-reduce:animate-none group-hover:[animation-play-state:paused]">
        {row.map((text, i) => (
          <span key={i} className="flex shrink-0 items-center gap-12">
            <span className="font-heading text-sm font-bold uppercase tracking-[0.35em]">
              {text}
            </span>
            <span className={`size-1.5 rounded-full ${dark ? "bg-white/40" : "bg-zinc-400"}`} />
          </span>
        ))}
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-25%); } }`}</style>
    </div>
  );
}
