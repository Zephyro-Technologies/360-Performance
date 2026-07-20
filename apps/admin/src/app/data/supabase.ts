import { createSupabaseClient, type AuthStorage } from "@360/supabase";

// Vite inlines these at build time. The anon key is safe to ship; the service-role
// key must NEVER appear here (privileged ops go through the admin-users Edge
// Function). In dev/tests we fall back to the local stack; a PRODUCTION build must
// supply both env vars — no hardcoded localhost is ever shipped to the cloud.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

function resolveConfig(): { url: string; anon: string } {
  if (envUrl && envAnon) return { url: envUrl, anon: envAnon };
  if (import.meta.env.PROD) {
    throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — set them for this build.");
  }
  console.warn("[supabase] env not set — using local stack defaults (dev only)");
  return { url: envUrl || "http://127.0.0.1:54421", anon: envAnon || "local-anon-key" };
}

// "Remember me" — where the auth session lives. Checked → localStorage (survives
// browser restarts, auto-refreshed indefinitely). Unchecked → sessionStorage, which
// the browser clears when the last tab/window closes, so the session effectively
// expires. The preference itself is kept in localStorage so we know, on next load,
// which store the session was written to. Default is remember = true.
const REMEMBER_KEY = "360.rememberMe";

function remembering(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Whether the current session was signed in with "Remember me" checked. */
export function isRemembered(): boolean {
  return remembering();
}

/** Call before signing in to choose session persistence. */
export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    // ignore storage failures (private mode / quota) — falls back to remember=true
  }
}

// Routes session reads/writes to the active store, and mirrors removals to both so
// a stale copy can never linger in the other store after sign-out or a switch.
const rememberMeStorage: AuthStorage = {
  getItem(key) {
    try {
      return (remembering() ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const active = remembering() ? localStorage : sessionStorage;
      const other = remembering() ? sessionStorage : localStorage;
      other.removeItem(key);
      active.setItem(key, value);
    } catch {
      // ignore storage failures
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // ignore storage failures
    }
  },
};

const cfg = resolveConfig();
export const supabase = createSupabaseClient(cfg.url, cfg.anon, { storage: rememberMeStorage });
