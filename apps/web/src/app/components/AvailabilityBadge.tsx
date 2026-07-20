import type { Availability } from "../data/products";
import { AVAILABILITY_LABELS, AVAILABILITY_STYLES } from "../lib/availability";

export function AvailabilityBadge({
  availability,
  count,
  className = "",
}: {
  availability: Availability;
  count?: number | null;
  className?: string;
}) {
  // Surface the actual count on low stock; badge label otherwise.
  const label =
    availability === "low-stock" && count != null && count > 0
      ? `Only ${count} left`
      : AVAILABILITY_LABELS[availability];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-body text-xs font-medium ${AVAILABILITY_STYLES[availability]} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
