import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getAnnouncement } from "../data/api";

const DISMISS_KEY = "360p-announcement-dismissed";

export function AnnouncementBar() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    if (dismissed) return;
    getAnnouncement()
      .then((msg) => {
        if (active && msg) {
          setMessage(msg);
          setVisible(true);
        }
      })
      .catch(() => {
        /* announcement is non-critical — stay hidden on error */
      });
    return () => {
      active = false;
    };
  }, []);

  // Publish the bar's height so the hero can subtract it. The hero is sized
  // calc(100svh - navbar), which ignored this bar entirely — so whenever an announcement was
  // live the hero ran ~40px taller than the space available and pushed the quick-stats row,
  // the one thing meant to sit at the fold, off the bottom of every phone screen.
  useEffect(() => {
    const root = document.documentElement;
    const set = (v: string) => root.style.setProperty("--announcement-h", v);
    if (!visible) {
      set("0px");
      return;
    }
    set(`${barRef.current?.offsetHeight ?? 0}px`);
    return () => set("0px");
  }, [visible, message]);

  if (!visible) return null;

  return (
    <div ref={barRef} className="relative bg-brand text-white">
      <div className="mx-auto max-w-7xl px-10 py-2 text-center">
        <p className="font-heading uppercase tracking-[0.2em] text-xs sm:text-sm">
          {message}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setVisible(false);
        }}
        /* 24px was the entire hit area, and this is the only way to dismiss the bar. */
        className="absolute right-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-sm transition-colors hover:bg-black/20"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
