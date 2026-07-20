// The current BUSINESS day (Pakistan — see businessTodayISO) as an ISO string, kept fresh across a
// tab left open.
//
// The period presets all resolve against "today". Reading it once at mount means a dashboard left
// open overnight silently stops advancing its end date. Re-reading on visibility/focus covers the
// realistic case (nobody watches an idle dashboard tick past midnight) without a timer to leak.
// Note the rollover is Pakistan midnight, not the viewer's, so a remote user sees the office's day.
import { useEffect, useState } from "react";
import { businessTodayISO } from "../data/analytics";

export function useToday(): string {
  const [today, setToday] = useState(businessTodayISO);

  useEffect(() => {
    const check = () => {
      const now = businessTodayISO();
      setToday((prev) => (prev === now ? prev : now)); // same string -> no re-render
    };
    window.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}
