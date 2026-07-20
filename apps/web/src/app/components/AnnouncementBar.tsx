import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getAnnouncement } from "../data/api";

const DISMISS_KEY = "360p-announcement-dismissed";

export function AnnouncementBar() {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

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

  if (!visible) return null;

  return (
    <div className="relative bg-brand text-white">
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
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-1 transition-colors hover:bg-black/20"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
