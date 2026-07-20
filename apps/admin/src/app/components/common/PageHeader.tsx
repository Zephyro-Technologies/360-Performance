// The page title/subtitle live in the TOPBAR (the shell's left slot), not in the page body —
// the chrome's header row does the work instead of every page restating it directly beneath.
//
// A page publishes its title with usePageHeader(). <PageHeader> keeps the original prop API
// (so every page's call site is unchanged) and additionally renders the page's action buttons
// as their own row, since only the title/subtitle move up.
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PageMeta = { title: string; subtitle?: string };

const PageHeaderContext = createContext<{
  meta: PageMeta;
  setMeta: (meta: PageMeta) => void;
} | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: "" });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

/** Read the current page's title/subtitle — the Topbar renders it. */
export function usePageMeta(): PageMeta {
  return useContext(PageHeaderContext)?.meta ?? { title: "" };
}

/**
 * Publish this page's title/subtitle to the topbar.
 *
 * Call it unconditionally at the top of the component — ABOVE any loading/not-found early
 * return (rules of hooks) — passing optional values that refine as data loads.
 * useLayoutEffect so the swap lands before paint: no flash of the previous page's title.
 */
export function usePageHeader(title: string, subtitle?: string) {
  const setMeta = useContext(PageHeaderContext)?.setMeta;
  useLayoutEffect(() => {
    setMeta?.({ title, subtitle });
  }, [setMeta, title, subtitle]);
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  usePageHeader(title, subtitle);
  // The title/subtitle render in the Topbar; only the actions stay on the page.
  if (!actions) return null;
  return <div className="mb-4 flex flex-wrap items-center justify-end gap-2">{actions}</div>;
}
