// Opens a create dialog when the URL carries ?new=1 — used by the Topbar "+ New" quick actions
// to land on a page and pop its create form. Strips the param afterwards so a refresh/back
// doesn't reopen it, while preserving any other params (e.g. ?tab=expenses).
import { useEffect } from "react";
import { useSearchParams } from "react-router";

export function useOpenOnNewParam(open: () => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") !== "1") return;
    open();
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
    // Re-runs only when the search string changes; open() is invoked once, then the param is cleared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
}
