// 360 Performance — money & date formatting (single source of truth, both apps).
//
// Canonical PKR convention — chosen explicitly, not inherited from whichever
// app happened to win:
//   • Symbol:   "Rs " (ASCII) — NOT "₨" (weak font/keyboard support) and NOT
//               "PKR" (verbose). "Rs" is the dominant written form in Pakistani
//               retail and matches the dashboard's existing output.
//   • Grouping: Western thousands — "1,234,567" — NOT South-Asian lakh/crore
//               ("12,34,567"). Formatted via the `en-US` locale so the result
//               is deterministic regardless of the runtime's ICU `en-PK` data.
//   • Decimals: 0 (whole rupees); values are rounded. Negative amounts (e.g.
//               reversal entries / credit balances) render as "-Rs 1,234".

export function formatPKR(value: number): string {
  const n = Math.round(value);
  const sign = n < 0 ? "-" : "";
  return `${sign}Rs ${Math.abs(n).toLocaleString("en-US")}`;
}

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `Rs ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `Rs ${(value / 1_000).toFixed(0)}K`;
  return `Rs ${value.toFixed(0)}`;
}

// Date convention: en-GB "02 Jun 2026" (2-digit day for stable tabular widths).
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Compact relative time: "just now" / "5m ago" / "3h ago" / "2d ago".
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
