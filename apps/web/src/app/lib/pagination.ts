/**
 * Build a compact pagination strip: first / last / current ± 1 / ellipses.
 * Example (current=5, total=10) → [1, '…', 4, 5, 6, '…', 10].
 */
export function buildPageList(
  current: number,
  total: number,
  siblings = 1,
): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [];
  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  pages.push(1);
  if (left > 2) pages.push("ellipsis");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push("ellipsis");
  pages.push(total);

  return pages;
}
