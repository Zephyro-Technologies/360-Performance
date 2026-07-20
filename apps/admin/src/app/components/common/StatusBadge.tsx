// Brand-consistent status pill. Uppercase, high-contrast, red reserved for
// states that demand attention (unpaid, out of stock, cancelled).
import { cn } from "@360/ui/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "dark";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-foreground border-border",
  success: "bg-black text-white border-black",
  warning: "bg-amber-100 text-amber-900 border-amber-300",
  danger: "bg-[#cc0000] text-white border-[#cc0000]",
  dark: "bg-black text-white border-black",
};

function toneFor(status: string): Tone {
  switch (status) {
    case "Paid":
    case "Delivered":
    case "Available":
    case "Visible":
      return "success";
    case "Partial":
    case "Limited":
    case "Processing":
    case "Ready to Ship":
    case "Shipped":
    case "Sourcing":
      return "warning";
    case "Unpaid":
    case "Overdue":
    case "Out of Stock":
    case "Cancelled":
      return "danger";
    case "Hidden":
    case "Archived":
      return "neutral";
    default:
      return "dark";
  }
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = toneFor(status);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs uppercase tracking-wide [font-family:var(--font-heading)]",
        TONES[tone],
        className,
      )}
    >
      {status}
    </span>
  );
}
