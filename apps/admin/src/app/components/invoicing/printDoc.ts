// Printing a sales document = browser print-to-PDF. Browsers use document.title as the
// suggested PDF filename, so we swap the title in for the print, then restore it.

// "Sea" / "Air" / "Sea + Air" from the lines' shipping modes.
export function shipModeLabel(types: Array<"sea" | "air">): string {
  const set = new Set(types);
  const parts: string[] = [];
  if (set.has("sea")) parts.push("Sea");
  if (set.has("air")) parts.push("Air");
  return parts.length ? parts.join(" + ") : "Sea";
}

// "{client} - {Invoice|Quotation} - {Sea|Air|Sea + Air} - 360 Performance", filename-safe.
export function docFilename(opts: { client: string; kind: "Invoice" | "Quotation"; mode: string }): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean(opts.client) || "Customer"} - ${opts.kind} - ${opts.mode} - 360 Performance`;
}

// Print with a specific suggested filename, restoring the page title afterwards.
export function printWithFilename(filename: string) {
  const prev = document.title;
  document.title = filename;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}
