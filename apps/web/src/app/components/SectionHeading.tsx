import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  action,
  align = "left",
  invert = false,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  align?: "left" | "center";
  invert?: boolean;
}) {
  const centered = align === "center";
  return (
    <div
      className={`mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${
        centered ? "sm:flex-col sm:items-center" : ""
      }`}
    >
      <div className={centered ? "text-center" : ""}>
        {eyebrow && (
          <span className="font-heading text-sm font-bold uppercase tracking-[0.2em] text-brand">
            {eyebrow}
          </span>
        )}
        <h2
          className={`mt-1 ${invert ? "text-white" : "text-foreground"}`}
        >
          {title}
        </h2>
        <div
          className={`mt-3 h-1 w-16 bg-brand ${centered ? "mx-auto" : ""}`}
          aria-hidden
        />
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
